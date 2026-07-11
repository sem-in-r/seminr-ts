# Generate golden DOT-plot fixtures for seminr-ts plotting-parity tests by
# running seminr (R) dot_graph()/dot_graph_htmt() on the bundled mobi dataset.
#
# Usage:  Rscript scripts/generate-plot-fixtures.R
# Requires: a local R with devtools + jsonlite, and the seminr source
# tree at ../seminr (sibling repo, pinned per tests/fixtures/PROVENANCE.md).
#
# Outputs (committed to this repo — they are the test contract):
#   tests/fixtures/plots/<case>.dot
#   tests/fixtures/plots/META-plots.json
#
# Cross-check: the four cases that duplicate seminr's committed testthat
# snapshots (tests/testthat/_snaps/plot-dot-snapshots.md) are asserted to be
# string-identical to the snapshot bodies; the script stops on any mismatch.

suppressMessages(devtools::load_all("../seminr", quiet = TRUE))
library(jsonlite)

dir.create("tests/fixtures/plots", recursive = TRUE, showWarnings = FALSE)

# strwidth()/strheight() metrics must come from the pdf device (AFM Helvetica
# metrics), exactly as seminr's own snapshot tests do (pdf(nullfile())).
pdf(nullfile())

cases <- list()

write_dot <- function(name, dot, description) {
  path <- file.path("tests/fixtures/plots", paste0(name, ".dot"))
  con <- file(path, open = "wb")
  writeLines(enc2utf8(as.character(dot)), con, sep = "\n", useBytes = TRUE)
  close(con)
  cases[[name]] <<- list(description = description)
  cat("wrote", path, "\n")
}

# ---------------------------------------------------------------------------
# Models (mirroring ../seminr/tests/testthat/test-plot-dot-snapshots.R and
# scripts/generate-fixtures.R M1/M6)
# ---------------------------------------------------------------------------

# Snapshot case 1: basic PLS, all reflective (full ECSI structure)
basic_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  reflective("Expectation",  multi_items("CUEX", 1:3)),
  reflective("Quality",      multi_items("PERQ", 1:7)),
  reflective("Value",        multi_items("PERV", 1:2)),
  reflective("Satisfaction", multi_items("CUSA", 1:3)),
  reflective("Complaints",   single_item("CUSCO")),
  reflective("Loyalty",      multi_items("CUSL", 1:3))
)
ecsi_sm <- relationships(
  paths(from = "Image",        to = c("Expectation", "Satisfaction", "Loyalty")),
  paths(from = "Expectation",  to = c("Quality", "Value", "Satisfaction")),
  paths(from = "Quality",      to = c("Value", "Satisfaction")),
  paths(from = "Value",        to = c("Satisfaction")),
  paths(from = "Satisfaction", to = c("Complaints", "Loyalty")),
  paths(from = "Complaints",   to = "Loyalty")
)
set.seed(123)
basic_model <- estimate_pls(data = mobi, measurement_model = basic_mm,
                            structural_model = ecsi_sm)

# Snapshot case 2: mixed reflective and composite
mixed_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",   multi_items("CUEX", 1:3), weights = unit_weights),
  composite("Quality",       multi_items("PERQ", 1:7), weights = correlation_weights),
  composite("Value",         multi_items("PERV", 1:2), weights = regression_weights),
  reflective("Satisfaction", multi_items("CUSA", 1:3)),
  reflective("Complaints",   single_item("CUSCO")),
  reflective("Loyalty",      multi_items("CUSL", 1:3))
)
set.seed(123)
mixed_model <- estimate_pls(data = mobi, measurement_model = mixed_mm,
                            structural_model = ecsi_sm)

# Snapshot case 3: product-indicator interaction
int_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  reflective("Expectation",  multi_items("CUEX", 1:3)),
  reflective("Quality",      multi_items("PERQ", 1:7)),
  reflective("Loyalty",      multi_items("CUSL", 1:3)),
  interaction_term(iv = "Quality", moderator = "Expectation", method = product_indicator)
)
int_sm <- relationships(
  paths(from = c("Image", "Quality", "Expectation", "Quality*Expectation"), to = "Loyalty")
)
set.seed(123)
int_model <- estimate_pls(data = mobi, measurement_model = int_mm,
                          structural_model = int_sm)

# Snapshot case 4: higher-order composite (two-stage, mode B)
hoc_mm <- constructs(
  composite("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",  multi_items("CUEX", 1:3)),
  composite("Quality",      multi_items("PERQ", 1:5)),
  composite("Loyalty",      multi_items("CUSL", 1:3)),
  composite("Value",        multi_items("PERV", 1:2)),
  higher_composite("Nick", dimensions = c("Quality", "Loyalty"), method = two_stage, weights = mode_B),
  composite("Satisfaction", multi_items("CUSA", 1:3))
)
hoc_sm <- relationships(
  paths(to = "Satisfaction", from = c("Image", "Expectation", "Value", "Nick"))
)
set.seed(123)
hoc_model <- estimate_pls(data = mobi, measurement_model = hoc_mm,
                          structural_model = hoc_sm)

# M1 (basic composite) + its M6 bootstrap — matches generate-fixtures.R so the
# TypeScript side can reproduce the boot numbers via boot_indices.json.
m1_mm <- constructs(
  composite("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",  multi_items("CUEX", 1:3)),
  composite("Value",        multi_items("PERV", 1:2), weights = regression_weights),
  composite("Satisfaction", multi_items("CUSA", 1:3))
)
m1_sm <- relationships(
  paths(from = c("Image", "Expectation", "Value"), to = "Satisfaction")
)
m1 <- estimate_pls(data = mobi, measurement_model = m1_mm, structural_model = m1_sm)
m6_boot <- bootstrap_model(m1, nboot = 200, cores = 1, seed = 123)

# ---------------------------------------------------------------------------
# Estimated-PLS cases (snapshot-equivalent + title)
# ---------------------------------------------------------------------------

write_dot("estimated_basic_reflective", dot_graph(basic_model),
          "dot_graph on all-reflective ECSI (testthat snapshot 'basic PLS all reflective')")
write_dot("estimated_mixed_composite", dot_graph(mixed_model),
          "dot_graph on mixed reflective/composite ECSI (testthat snapshot 'mixed reflective and composite')")
write_dot("estimated_interaction", dot_graph(int_model),
          "dot_graph on product_indicator interaction model (testthat snapshot 'interaction term')")
write_dot("estimated_hoc", dot_graph(hoc_model),
          "dot_graph on higher_composite two_stage/mode_B model (testthat snapshot 'higher-order composite')")
write_dot("estimated_basic_title", dot_graph(basic_model, title = "PLS-Model plot"),
          "dot_graph on all-reflective ECSI with title = 'PLS-Model plot'")

# ---------------------------------------------------------------------------
# Theme variants (on the all-reflective ECSI model)
# ---------------------------------------------------------------------------

write_dot("theme_academic", dot_graph(basic_model, theme = seminr_theme_academic()),
          "all-reflective ECSI with seminr_theme_academic()")
write_dot("theme_smart", dot_graph(basic_model, theme = seminr_theme_smart()),
          "all-reflective ECSI with seminr_theme_smart()")
write_dot("theme_dark", dot_graph(basic_model, theme = seminr_theme_dark()),
          "all-reflective ECSI with seminr_theme_dark()")

custom_theme <- seminr_theme_create(
  plot.adj = TRUE,
  plot.specialcharacters = FALSE,
  plot.rounding = 2,
  plot.title.fontsize = 30,
  plot.bgcolor = "white",
  sm.edge.label.all_betas = FALSE,
  sm.node.fill = "lightcyan",
  mm.edge.label.show = FALSE
)
write_dot("theme_custom", dot_graph(basic_model, title = "Custom theme", theme = custom_theme),
          paste0("all-reflective ECSI with seminr_theme_create(plot.adj=TRUE, ",
                 "plot.specialcharacters=FALSE, plot.rounding=2, plot.title.fontsize=30, ",
                 "plot.bgcolor='white', sm.edge.label.all_betas=FALSE, sm.node.fill='lightcyan', ",
                 "mm.edge.label.show=FALSE), title='Custom theme'"))

# ---------------------------------------------------------------------------
# Bootstrapped-model cases (M6 boot: nboot=200, seed=123, cores=1)
# ---------------------------------------------------------------------------

write_dot("boot_default", dot_graph(m6_boot),
          "dot_graph on M6 bootstrap (M1, nboot=200, seed=123), default theme, alpha=0.05")
write_dot("boot_alpha01", dot_graph(m6_boot, alpha = 0.01),
          "dot_graph on M6 bootstrap, default theme, alpha=0.01")

boot_theme <- seminr_theme_create(
  sm.edge.boot.show_t_value = TRUE,
  sm.edge.boot.show_p_value = TRUE,
  sm.edge.boot.show_p_stars = TRUE,
  sm.edge.boot.show_ci = TRUE,
  mm.edge.boot.show_t_value = TRUE,
  mm.edge.boot.show_p_value = TRUE,
  mm.edge.boot.show_p_stars = TRUE,
  mm.edge.boot.show_ci = TRUE,
  mm.edge.boot.template = edge_template_default()
)
write_dot("boot_full_labels", dot_graph(m6_boot, theme = boot_theme),
          paste0("dot_graph on M6 bootstrap with all sm/mm boot label elements enabled ",
                 "(t, p, stars, ci; mm template=edge_template_default), alpha=0.05"))

# ---------------------------------------------------------------------------
# Specification-only cases (artificial unit-valued model path)
# ---------------------------------------------------------------------------

write_dot("spec_measurement", dot_graph(mixed_mm),
          "dot_graph on the mixed reflective/composite measurement model (spec only)")
write_dot("spec_structural", dot_graph(ecsi_sm),
          "dot_graph on the ECSI structural model (spec only)")
write_dot("spec_specified", dot_graph(specify_model(mixed_mm, ecsi_sm)),
          "dot_graph on specify_model(mixed mm, ECSI sm) (spec only)")

# ---------------------------------------------------------------------------
# HTMT cases (bootstrapped model only)
# ---------------------------------------------------------------------------

write_dot("htmt_default", dot_graph_htmt(m6_boot),
          "dot_graph_htmt on M6 bootstrap, defaults (threshold=1, omit=TRUE, use_ci=FALSE)")
write_dot("htmt_all_edges", dot_graph_htmt(m6_boot, omit_threshold_edges = FALSE),
          "dot_graph_htmt on M6 bootstrap, omit_threshold_edges=FALSE")
write_dot("htmt_ci", dot_graph_htmt(m6_boot, htmt_threshold = 0.9, use_ci = TRUE),
          "dot_graph_htmt on M6 bootstrap, htmt_threshold=0.9, use_ci=TRUE")

# ---------------------------------------------------------------------------
# Cross-check: script output for the four snapshot-equivalent cases must equal
# the committed testthat snapshot bodies.
# ---------------------------------------------------------------------------

read_snapshot_bodies <- function(path) {
  lines <- readLines(path, encoding = "UTF-8")
  bodies <- list()
  title <- NULL
  in_output <- FALSE
  body <- character()
  flush <- function() {
    if (!is.null(title)) {
      # trim trailing blank lines (block separator)
      while (length(body) && !nzchar(trimws(body[length(body)]))) {
        body <- body[-length(body)]
      }
      bodies[[title]] <<- body
    }
  }
  for (line in lines) {
    if (grepl("^# ", line)) {
      flush()
      title <- sub("^# ", "", line)
      in_output <- FALSE
      body <- character()
    } else if (grepl("^    Output$", line)) {
      in_output <- TRUE
    } else if (in_output) {
      body <- c(body, sub("^      ", "", line))
    }
  }
  flush()
  bodies
}

snapshot_bodies <- read_snapshot_bodies("../seminr/tests/testthat/_snaps/plot-dot-snapshots.md")

check_against_snapshot <- function(case_name, snapshot_title) {
  dot_lines <- readLines(file.path("tests/fixtures/plots", paste0(case_name, ".dot")),
                         encoding = "UTF-8")
  while (length(dot_lines) && !nzchar(trimws(dot_lines[length(dot_lines)]))) {
    dot_lines <- dot_lines[-length(dot_lines)]
  }
  snap_lines <- snapshot_bodies[[snapshot_title]]
  if (is.null(snap_lines)) {
    stop("Snapshot not found: ", snapshot_title)
  }
  if (!identical(dot_lines, snap_lines)) {
    n_common <- min(length(dot_lines), length(snap_lines))
    diff_at <- which(dot_lines[seq_len(n_common)] != snap_lines[seq_len(n_common)])
    detail <- if (length(diff_at)) {
      paste0("; first differing line ", diff_at[1],
             ":\n  fixture: ", dot_lines[diff_at[1]],
             "\n  snapshot: ", snap_lines[diff_at[1]])
    } else {
      ""
    }
    stop("Mismatch between ", case_name, " and snapshot '", snapshot_title, "'",
         " (lengths ", length(dot_lines), " vs ", length(snap_lines), ")", detail)
  }
  cat("cross-check OK:", case_name, "==", snapshot_title, "\n")
}

check_against_snapshot("estimated_basic_reflective", "DOT output: basic PLS all reflective")
check_against_snapshot("estimated_mixed_composite", "DOT output: mixed reflective and composite")
check_against_snapshot("estimated_interaction", "DOT output: interaction term")
check_against_snapshot("estimated_hoc", "DOT output: higher-order composite")

# ---------------------------------------------------------------------------
# META
# ---------------------------------------------------------------------------

seminr_desc <- read.dcf("../seminr/DESCRIPTION")
seminr_commit <- tryCatch(
  system("git -C ../seminr rev-parse HEAD", intern = TRUE),
  error = function(e) NA_character_
)
write_json(
  list(
    generatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
    seminrVersion = unname(seminr_desc[1, "Version"]),
    seminrCommit = seminr_commit,
    rVersion = R.version.string,
    notes = paste0("DOT strings from dot_graph()/dot_graph_htmt() with pdf(nullfile()) ",
                   "device metrics; exact string parity expected. Boot cases use the M6 ",
                   "bootstrap config (M1, nboot=200, seed=123, cores=1; see boot_indices.json)."),
    cases = cases
  ),
  "tests/fixtures/plots/META-plots.json",
  digits = NA, auto_unbox = TRUE, pretty = TRUE, null = "null", na = "null"
)
cat("wrote tests/fixtures/plots/META-plots.json\n")

dev.off()
cat("done\n")
