# Generate golden fixtures for semints CBSEM/CFA parity tests by running
# seminr (R) + lavaan on the bundled mobi dataset.
#
# Usage:  Rscript scripts/generate-cbsem-fixtures.R
# Requires: a local R with devtools + jsonlite + lavaan, and the seminr source
# tree at ../seminr (sibling repo).
#
# Outputs (committed to this repo — they are the test contract):
#   tests/fixtures/expected/cbsem-*.json, META-cbsem.json

suppressMessages(devtools::load_all("../seminr", quiet = TRUE))
library(jsonlite)

dir.create("tests/fixtures/expected", recursive = TRUE, showWarnings = FALSE)

# Optimizer override applied to every lavaan fit (forwarded through seminr's
# `...`): R's optim BFGS with a brutal tolerance lands ~1e-12 from the true
# optimum, whereas lavaan's default nlminb stops with rel.tol=1e-10 and leaves
# parameters up to ~2e-4 off along flat ridges (and refuses tighter rel.tol).
# Cross-implementation parity tests need fixture values at the actual optimum;
# the numbers differ from seminr's defaults by < 2e-4 (below any reported
# precision). Named arguments propagate into internal first-stage CFAs too.
OPTIM_METHOD <- "BFGS"
OPTIM_CONTROL <- list(reltol = 1e-15, maxit = 100000)

# ---------------------------------------------------------------------------
# Serialization helpers (mirrors generate-fixtures.R conventions)
# ---------------------------------------------------------------------------

mat <- function(m) {
  m <- as.matrix(m)
  list(
    rows = rownames(m),
    cols = colnames(m),
    values = unname(apply(m, 1, function(r) unname(as.numeric(r)), simplify = FALSE))
  )
}

named_vec <- function(v) as.list(setNames(as.numeric(v), names(v)))

# Character matrix (mmMatrix/smMatrix) -> row-major string values
char_mat <- function(m) {
  m <- as.matrix(m)
  list(
    cols = colnames(m),
    values = unname(apply(m, 1, function(r) unname(as.character(r)), simplify = FALSE))
  )
}

write_fixture <- function(name, obj) {
  path <- file.path("tests/fixtures/expected", paste0(name, ".json"))
  write_json(obj, path, digits = NA, auto_unbox = TRUE, pretty = TRUE, null = "null")
  cat("wrote", path, "\n")
}

# Parameter-estimate data frames -> column lists (keeps row order)
df_export <- function(df, cols) {
  out <- lapply(cols, function(cn) {
    col <- df[[cn]]
    if (is.numeric(col)) as.list(as.numeric(col)) else as.list(as.character(col))
  })
  setNames(out, cols)
}

# ---------------------------------------------------------------------------
# lavaan fit exports
# ---------------------------------------------------------------------------

lav_fit_exports <- function(fit) {
  est <- lavaan::lavInspect(fit, "est")
  std <- lavaan::lavInspect(fit, "std")
  pt <- lavaan::parameterTable(fit)
  ss <- lavaan::standardizedSolution(fit)
  pe <- lavaan::parameterEstimates(fit)

  out <- list(
    N = lavaan::lavInspect(fit, "nobs"),
    nvar = ncol(est$lambda %||% lavaan::lavInspect(fit, "sampstat")$cov),
    npar = as.numeric(lavaan::fitMeasures(fit, "npar")),
    df = as.numeric(lavaan::fitMeasures(fit, "df")),
    iterations = tryCatch(fit@optim$iterations, error = function(e) NA),
    converged = lavaan::lavInspect(fit, "converged"),
    sampleCov = mat(lavaan::lavInspect(fit, "sampstat")$cov),
    parTable = df_export(pt, c("id", "lhs", "op", "rhs", "free", "ustart", "start", "est", "se")),
    unstd = list(
      lambda = mat(est$lambda),
      theta = mat(est$theta),
      psi = mat(est$psi)
    ),
    std = list(
      lambda = mat(std$lambda),
      theta = mat(std$theta),
      psi = mat(std$psi)
    ),
    corLv = mat(as.matrix(lavaan::lavInspect(fit, "cor.lv"))),
    parameterEstimates = df_export(pe, c("lhs", "op", "rhs", "est", "se", "z", "pvalue", "ci.lower", "ci.upper")),
    standardizedSolution = df_export(ss, c("lhs", "op", "rhs", "est.std", "se", "z", "pvalue", "ci.lower", "ci.upper")),
    fitMeasures = named_vec(lavaan::fitMeasures(fit))
  )
  # nvar via lambda rows (observed indicators)
  out$nvar <- nrow(est$lambda)
  if (!is.null(est$beta)) {
    out$unstd$beta <- mat(est$beta)
    out$std$beta <- mat(std$beta)
    r2 <- lavaan::lavInspect(fit, "r2")
    out$r2 <- named_vec(r2)
  }
  out
}

`%||%` <- function(a, b) if (is.null(a)) b else a

# ---------------------------------------------------------------------------
# seminr model exports (both cfa_model and cbsem_model)
# ---------------------------------------------------------------------------

seminr_exports <- function(model, refit_ml = TRUE) {
  scores <- model$construct_scores
  summ <- summary(model)

  out <- list(
    lavaanModel = model$lavaan_model,
    mmMatrix = char_mat(model$mmMatrix %||% mm2matrix(model$measurement_model)),
    factorLoadings = mat(model$factor_loadings),
    tenBerge = list(
      weights = mat(model$item_weights),
      scoresHead = mat(scores[1:5, , drop = FALSE]),
      scoresAbsMean = named_vec(colMeans(abs(scores)))
    ),
    reliability = mat(summ$quality$reliability),
    mlr = lav_fit_exports(model$lavaan_output)
  )

  if (!is.null(model$smMatrix)) {
    out$smMatrix <- char_mat(model$smMatrix)
    out$pathCoef <- mat(model$path_coef)
    out$pathsCoefficients <- mat(summ$paths$coefficients)
    vifs <- summ$quality$antecedent_vifs
    out$antecedentVifs <- lapply(vifs, named_vec)
  }

  if (refit_ml) {
    # Re-fit the identical lavaan model with plain ML + standard SEs: point
    # estimates match MLR; SEs/tests/fit become the phase-1 TS parity target.
    fn <- if (is.null(model$smMatrix)) lavaan::cfa else lavaan::sem
    ml_fit <- fn(model = model$lavaan_model, data = as.data.frame(model$data),
                 std.lv = TRUE, estimator = "ML",
                 optim.method = OPTIM_METHOD, control = OPTIM_CONTROL)
    out$ml <- lav_fit_exports(ml_fit)
  }

  out
}

# ---------------------------------------------------------------------------
# C1 — CFA from demo/seminr-cbsem-cfa-ecsi.R (verbatim, incl. PERQ item errors
# whose items are NOT in the measurement model — Q5 in the plan)
# ---------------------------------------------------------------------------

c1_mm <- constructs(
  reflective("Image",       multi_items("IMAG", 1:5)),
  reflective("Expectation", multi_items("CUEX", 1:3)),
  reflective("Loyalty",     multi_items("CUSL", 1:3)),
  reflective("Value",       multi_items("PERV", 1:2)),
  reflective("Complaints",  single_item("CUSCO"))
)
c1_am <- associations(
  item_errors(c("PERQ1", "PERQ2"), "CUEX3"),
  item_errors("IMAG1", "CUEX2")
)
c1 <- estimate_cfa(mobi, c1_mm, c1_am, optim.method = OPTIM_METHOD, control = OPTIM_CONTROL)

write_fixture("cbsem-C1_cfa_demo", c(
  list(settings = list(
    description = "CFA from demo/seminr-cbsem-cfa-ecsi.R: 5 reflective constructs + item_errors incl. PERQ1/PERQ2 not in mm",
    estimator = "MLR", stdLv = TRUE
  )),
  seminr_exports(c1)
))

# ---------------------------------------------------------------------------
# C2 — CBSEM from demo/seminr-cbsem-cfa-ecsi.R (verbatim): C1 mm + product
# indicator interaction, 6 structural paths, same associations
# ---------------------------------------------------------------------------

c2_mm <- append(
  c1_mm,
  interaction_term("Image", "Expectation", method = product_indicator)
)
c2_sm <- relationships(
  paths(from = c("Image", "Expectation"), to = c("Value", "Loyalty")),
  paths(from = c("Complaints", "Image*Expectation"), to = "Loyalty")
)
c2 <- estimate_cbsem(mobi, c2_mm, c2_sm, c1_am, optim.method = OPTIM_METHOD, control = OPTIM_CONTROL)

write_fixture("cbsem-C2_demo_pi_interaction", c(
  list(settings = list(
    description = "CBSEM from demo/seminr-cbsem-cfa-ecsi.R: product_indicator Image*Expectation, paths to Value/Loyalty",
    estimator = "MLR", stdLv = TRUE, interactionMethod = "product_indicator"
  )),
  seminr_exports(c2),
  list(interactionItemNames = as.list(setdiff(colnames(c2$data), colnames(c2$rawdata))))
))

# ---------------------------------------------------------------------------
# C3 — full ECSI CBSEM from the estimate_cbsem() doc example + its plain CFA
# ---------------------------------------------------------------------------

c3_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  reflective("Quality",      multi_items("PERQ", 1:7)),
  reflective("Value",        multi_items("PERV", 1:2)),
  reflective("Satisfaction", multi_items("CUSA", 1:3)),
  reflective("Complaints",   single_item("CUSCO")),
  reflective("Loyalty",      multi_items("CUSL", 1:3))
)
c3_am <- associations(
  item_errors(c("PERQ1", "PERQ2"), "IMAG1")
)
c3_sm <- relationships(
  paths(from = c("Image", "Quality"), to = c("Value", "Satisfaction")),
  paths(from = c("Value", "Satisfaction"), to = c("Complaints", "Loyalty")),
  paths(from = "Complaints", to = "Loyalty")
)
c3 <- estimate_cbsem(mobi, c3_mm, c3_sm, c3_am, optim.method = OPTIM_METHOD, control = OPTIM_CONTROL)

write_fixture("cbsem-C3_ecsi", c(
  list(settings = list(
    description = "Full ECSI CBSEM from estimate_cbsem() doc example (all items in mm)",
    estimator = "MLR", stdLv = TRUE
  )),
  seminr_exports(c3)
))

# NOTE: estimate_cfa on the full C3 mm fails in seminr itself (lavaan
# post-check: latent covariance matrix not positive definite -> try_or_stop).
# The clean CFA target is instead the estimate_cfa() doc example, whose
# association items are all inside the mm.
c3cfa_mm <- constructs(
  reflective("Image",       multi_items("IMAG", 1:5)),
  reflective("Expectation", multi_items("CUEX", 1:3)),
  reflective("Quality",     multi_items("PERQ", 1:7))
)
c3cfa_am <- associations(
  item_errors(c("PERQ1", "PERQ2"), "CUEX3"),
  item_errors("IMAG1", "CUEX2")
)
c3_cfa <- estimate_cfa(mobi, c3cfa_mm, c3cfa_am, optim.method = OPTIM_METHOD, control = OPTIM_CONTROL)
write_fixture("cbsem-C3_cfa_doc", c(
  list(settings = list(
    description = "CFA from the estimate_cfa() doc example: Image/Expectation/Quality + item errors all inside mm (clean slice-4 target)",
    estimator = "MLR", stdLv = TRUE
  )),
  seminr_exports(c3_cfa)
))

# ---------------------------------------------------------------------------
# C4 — interaction CBSEM models from test-cbsem-interactions.R (both methods;
# same models behind seminr's own V_3_6_0 cbsem-interaction-* fixtures)
# ---------------------------------------------------------------------------

c4_partial_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  reflective("Expectation",  single_item("CUEX3")),
  reflective("Value",        multi_items("PERV", 1:2)),
  reflective("Satisfaction", multi_items("CUSA", 1:3))
)
c4_sm <- relationships(
  paths(to = "Satisfaction",
        from = c("Image", "Expectation", "Value", "Image*Expectation"))
)

c4_variant <- function(method, method_name) {
  mm <- append(c4_partial_mm,
               c(scaled_interaction = interaction_term(iv = "Image", moderator = "Expectation", method = method)))
  model <- estimate_cbsem(data = mobi, measurement_model = mm, structural_model = c4_sm, optim.method = OPTIM_METHOD, control = OPTIM_CONTROL)
  c(
    list(settings = list(
      description = paste0("test-cbsem-interactions.R model, method=", method_name),
      estimator = "MLR", stdLv = TRUE, interactionMethod = method_name
    )),
    seminr_exports(model),
    list(
      interactionItemNames = as.list(setdiff(colnames(model$data), colnames(model$rawdata))),
      interactionDataHead = mat(as.matrix(model$data[1:5, setdiff(colnames(model$data), colnames(model$rawdata)), drop = FALSE])),
      interactionDataAbsMean = named_vec(colMeans(abs(model$data[, setdiff(colnames(model$data), colnames(model$rawdata)), drop = FALSE])))
    )
  )
}

write_fixture("cbsem-C4_intxn_pi", c4_variant(product_indicator, "product_indicator"))
write_fixture("cbsem-C4_intxn_2stage", c4_variant(two_stage, "two_stage"))

# First-stage CFA of the two-stage method (main-effects mm only) — the TS port
# must reproduce these ten Berge scores to build the interaction column.
c4_first_stage <- estimate_cfa(mobi, c4_partial_mm, optim.method = OPTIM_METHOD, control = OPTIM_CONTROL)
write_fixture("cbsem-C4_first_stage_cfa", c(
  list(settings = list(
    description = "First-stage CFA behind C4 two_stage: main-effects mm, no associations",
    estimator = "MLR", stdLv = TRUE
  )),
  seminr_exports(c4_first_stage)
))

# ---------------------------------------------------------------------------
# C5 — higher_reflective HOC from test-cbsem-higher-order.R (single-HOC case)
# ---------------------------------------------------------------------------

c5_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  reflective("Satisfaction", multi_items("CUSA", 1:3)),
  higher_reflective("ImageSat", c("Image", "Satisfaction")),
  reflective("Expectation", multi_items("CUEX", 1:3)),
  reflective("Loyalty",     multi_items("CUSL", 1:3))
)
c5_sm <- relationships(
  paths(from = c("ImageSat", "Satisfaction", "Expectation"), to = "Loyalty")
)
c5 <- estimate_cbsem(data = mobi, measurement_model = c5_mm, structural_model = c5_sm, optim.method = OPTIM_METHOD, control = OPTIM_CONTROL)

write_fixture("cbsem-C5_hoc", c(
  list(settings = list(
    description = "higher_reflective ImageSat =~ Image + Satisfaction; from test-cbsem-higher-order.R single-HOC case",
    estimator = "MLR", stdLv = TRUE
  )),
  seminr_exports(c5)
))

# ---------------------------------------------------------------------------
# META
# ---------------------------------------------------------------------------

seminr_desc <- read.dcf("../seminr/DESCRIPTION")
seminr_commit <- tryCatch(
  system("git -C ../seminr rev-parse HEAD", intern = TRUE),
  error = function(e) NA_character_
)
write_fixture("META-cbsem", list(
  generatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  seminrVersion = unname(seminr_desc[1, "Version"]),
  seminrCommit = seminr_commit,
  lavaanVersion = as.character(packageVersion("lavaan")),
  rVersion = R.version.string,
  optimizer = list(method = OPTIM_METHOD, control = OPTIM_CONTROL,
                   note = "BFGS reltol 1e-15 polish; lavaan default nlminb stops ~2e-4 off along flat ridges"),
  tolerance = 1e-5
))

cat("done\n")
