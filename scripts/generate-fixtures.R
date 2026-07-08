# Generate golden fixtures for seminr-ts parity tests by running seminr (R) on
# the bundled mobi dataset.
#
# Usage:  Rscript scripts/generate-fixtures.R
# Requires: a local R with devtools + jsonlite, and the seminr source tree at
# ../seminr (sibling repo).
#
# Outputs (committed to this repo — they are the test contract):
#   tests/fixtures/data/mobi.csv
#   tests/fixtures/expected/M*.json, boot_indices.json, META.json

suppressMessages(devtools::load_all("../seminr", quiet = TRUE))
library(jsonlite)

dir.create("tests/fixtures/data", recursive = TRUE, showWarnings = FALSE)
dir.create("tests/fixtures/expected", recursive = TRUE, showWarnings = FALSE)

# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

# Named matrix -> {rows, cols, values} with row-major values
mat <- function(m) {
  m <- as.matrix(m)
  list(
    rows = rownames(m),
    cols = colnames(m),
    values = unname(apply(m, 1, function(r) unname(as.numeric(r)), simplify = FALSE))
  )
}

write_fixture <- function(name, obj) {
  path <- file.path("tests/fixtures/expected", paste0(name, ".json"))
  write_json(obj, path, digits = NA, auto_unbox = TRUE, pretty = TRUE,
             null = "null", na = "null")
  cat("wrote", path, "\n")
}

# Common exports for an estimated pls_model
model_exports <- function(model) {
  scores <- model$construct_scores
  list(
    pathCoef = mat(model$path_coef),
    outerLoadings = mat(model$outer_loadings),
    outerWeights = mat(model$outer_weights),
    rSquared = mat(model$rSquared),
    iterations = model$iterations,
    constructScoresHead = mat(scores[1:5, , drop = FALSE]),
    # column mean of |score| — discriminative full-matrix checksum
    # (plain column sums are ~0 and sums of squares are ~n-1 by construction)
    constructScoresAbsMean = as.list(colMeans(abs(scores)))
  )
}

# ---------------------------------------------------------------------------
# Data export
# ---------------------------------------------------------------------------

write.csv(mobi, "tests/fixtures/data/mobi.csv", row.names = FALSE)
cat("wrote tests/fixtures/data/mobi.csv (", nrow(mobi), "x", ncol(mobi), ")\n")

# ---------------------------------------------------------------------------
# M1 — basic composite: Value is mode B, rest mode A
# ---------------------------------------------------------------------------

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

write_fixture("M1_basic_composite", c(
  list(settings = list(
    description = "Image(A,IMAG1-5)+Expectation(A,CUEX1-3)+Value(B,PERV1-2)+Satisfaction(A,CUSA1-3); Image,Expectation,Value->Satisfaction",
    innerWeights = "path_weighting", maxIt = 300, stopCriterion = 7
  )),
  model_exports(m1)
))

# ---------------------------------------------------------------------------
# M2 — full ECSI (mirrors seminr demo seminr-pls-ecsi.R)
# ---------------------------------------------------------------------------

m2_mm <- constructs(
  composite("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",  multi_items("CUEX", 1:3)),
  composite("Quality",      multi_items("PERQ", 1:7)),
  composite("Value",        multi_items("PERV", 1:2)),
  composite("Satisfaction", multi_items("CUSA", 1:3)),
  composite("Complaints",   single_item("CUSCO")),
  composite("Loyalty",      multi_items("CUSL", 1:3))
)
m2_sm <- relationships(
  paths(from = "Image",        to = c("Expectation", "Satisfaction", "Loyalty")),
  paths(from = "Expectation",  to = c("Quality", "Value", "Satisfaction")),
  paths(from = "Quality",      to = c("Value", "Satisfaction")),
  paths(from = "Value",        to = c("Satisfaction")),
  paths(from = "Satisfaction", to = c("Complaints", "Loyalty")),
  paths(from = "Complaints",   to = "Loyalty")
)
m2 <- estimate_pls(data = mobi, measurement_model = m2_mm, structural_model = m2_sm)

write_fixture("M2_full_ecsi", c(
  list(settings = list(
    description = "Full ECSI model, all mode A composites, from seminr demo seminr-pls-ecsi.R",
    innerWeights = "path_weighting", maxIt = 300, stopCriterion = 7
  )),
  model_exports(m2),
  list(totalEffects = mat(total_effects(m2$path_coef)))
))

# ---------------------------------------------------------------------------
# M3 — reflective (PLSc): M1 constructs as reflective
# ---------------------------------------------------------------------------

m3_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  reflective("Expectation",  multi_items("CUEX", 1:3)),
  reflective("Value",        multi_items("PERV", 1:2)),
  reflective("Satisfaction", multi_items("CUSA", 1:3))
)
m3 <- estimate_pls(data = mobi, measurement_model = m3_mm, structural_model = m1_sm)

# rho_A uses outer_weights/data/mmMatrix, none of which PLSc mutates, so
# computing it on the returned (corrected) model reproduces PLSc's inputs.
m3_rho <- rho_A(m3, m3$constructs)

write_fixture("M3_reflective_plsc", c(
  list(settings = list(
    description = "M1 structure with all reflective() constructs -> PLSc applied",
    innerWeights = "path_weighting", maxIt = 300, stopCriterion = 7
  )),
  model_exports(m3),
  list(rhoA = mat(m3_rho))
))

# ---------------------------------------------------------------------------
# M4 — interaction Image*Expectation -> Satisfaction, one variant per method
# ---------------------------------------------------------------------------

m4_sm <- relationships(
  paths(from = c("Image", "Expectation", "Value", "Image*Expectation"),
        to = "Satisfaction")
)

m4_variant <- function(method, method_name) {
  mm <- constructs(
    composite("Image",        multi_items("IMAG", 1:5)),
    composite("Expectation",  multi_items("CUEX", 1:3)),
    composite("Value",        multi_items("PERV", 1:2)),
    composite("Satisfaction", multi_items("CUSA", 1:3)),
    interaction_term(iv = "Image", moderator = "Expectation",
                     method = method, weights = mode_A)
  )
  model <- estimate_pls(data = mobi, measurement_model = mm, structural_model = m4_sm)

  # interaction item columns generated during estimation (in data, not rawdata)
  int_items <- setdiff(colnames(model$data), colnames(model$rawdata))
  out <- c(
    list(settings = list(
      description = paste0("M1 + Image*Expectation->Satisfaction, method=", method_name),
      interactionMethod = method_name,
      innerWeights = "path_weighting", maxIt = 300, stopCriterion = 7
    )),
    model_exports(model),
    list(
      interactionItemNames = as.list(int_items),
      interactionDataHead = mat(model$data[1:5, int_items, drop = FALSE]),
      interactionDataAbsMean = as.list(colMeans(abs(model$data[, int_items, drop = FALSE])))
    )
  )
  if (method_name == "orthogonal") {
    oc <- model$interaction_params[["Image*Expectation"]]$ortho_coefs
    out$orthoCoefs <- lapply(oc, function(v) as.list(as.numeric(v)) |>
                               setNames(names(v)))
  }
  out
}

write_fixture("M4_interaction_product_indicator",
              m4_variant(product_indicator, "product_indicator"))
write_fixture("M4_interaction_orthogonal",
              m4_variant(orthogonal, "orthogonal"))
write_fixture("M4_interaction_two_stage",
              m4_variant(two_stage, "two_stage"))

# ---------------------------------------------------------------------------
# M5 — higher-order construct (mirrors seminr test-hoc.R simple case)
# ---------------------------------------------------------------------------

m5_mm <- constructs(
  composite("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",  multi_items("CUEX", 1:3)),
  composite("Quality",      multi_items("PERQ", 1:7)),
  composite("Value",        multi_items("PERV", 1:2)),
  higher_composite("Satisfaction", dimensions = c("Image", "Value"),
                   method = two_stage, weights = mode_A),
  composite("Complaints",   single_item("CUSCO")),
  composite("Loyalty",      multi_items("CUSL", 1:3))
)
m5_sm <- relationships(
  paths(from = c("Expectation", "Quality"), to = "Satisfaction"),
  paths(from = "Satisfaction", to = c("Complaints", "Loyalty"))
)
m5 <- estimate_pls(data = mobi, measurement_model = m5_mm, structural_model = m5_sm)

write_fixture("M5_hoc_two_stage", c(
  list(settings = list(
    description = "HOC Satisfaction=higher_composite(Image,Value,two_stage,mode_A); from seminr test-hoc.R",
    innerWeights = "path_weighting", maxIt = 300, stopCriterion = 7
  )),
  model_exports(m5),
  list(firstStage = list(
    pathCoef = mat(m5$first_stage_model$path_coef),
    outerWeights = mat(m5$first_stage_model$outer_weights),
    constructScoresHead = mat(m5$first_stage_model$construct_scores[1:5, , drop = FALSE]),
    iterations = m5$first_stage_model$iterations
  ))
))

# ---------------------------------------------------------------------------
# M5b — HOC + two-stage interaction (mirrors seminr test-hoc.R second case)
# ---------------------------------------------------------------------------

m5b_mm <- constructs(
  composite("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",  multi_items("CUEX", 1:3)),
  composite("Quality",      multi_items("PERQ", 1:5)),
  composite("Loyalty",      multi_items("CUSL", 1:3)),
  composite("Value",        multi_items("PERV", 1:2)),
  higher_composite("Nick", dimensions = c("Quality", "Loyalty"),
                   method = two_stage, weights = mode_A),
  composite("Satisfaction", multi_items("CUSA", 1:3)),
  interaction_term(iv = "Image", moderator = "Expectation",
                   method = two_stage, weights = mode_A)
)
m5b_sm <- relationships(
  paths(to = "Satisfaction",
        from = c("Image", "Expectation", "Value", "Nick", "Image*Expectation"))
)
m5b <- estimate_pls(data = mobi, measurement_model = m5b_mm, structural_model = m5b_sm)

write_fixture("M5b_hoc_two_stage_interaction", c(
  list(settings = list(
    description = "HOC Nick=(Quality,Loyalty) + two_stage interaction Image*Expectation; from seminr test-hoc.R case 2",
    innerWeights = "path_weighting", maxIt = 300, stopCriterion = 7
  )),
  model_exports(m5b)
))

# ---------------------------------------------------------------------------
# M6 — bootstrap of M1: nboot=200, seed=123, single core
# ---------------------------------------------------------------------------

m6_boot <- bootstrap_model(m1, nboot = 200, cores = 1, seed = 123)

# summary.boot_seminr_model tables; total indirect paths may be the
# "No indirect effects" sentinel string (report_paths_and_intervals.R:353)
boot_summary_exports <- function(bs) {
  tip <- bs$bootstrapped_total_indirect_paths
  list(
    paths = mat(bs$bootstrapped_paths),
    weights = mat(bs$bootstrapped_weights),
    loadings = mat(bs$bootstrapped_loadings),
    htmt = mat(bs$bootstrapped_HTMT),
    totalPaths = mat(bs$bootstrapped_total_paths),
    totalIndirectPaths = if (is.character(tip)) tip[[1]] else mat(tip)
  )
}

write_fixture("M6_bootstrap", list(
  settings = list(
    description = "bootstrap_model on M1: nboot=200, seed=123, cores=1, path_weighting",
    nboot = 200, seed = 123
  ),
  boots = m6_boot$boots,
  pathsDescriptives = mat(m6_boot$paths_descriptives),
  loadingsDescriptives = mat(m6_boot$loadings_descriptives),
  weightsDescriptives = mat(m6_boot$weights_descriptives),
  totalPathsDescriptives = mat(m6_boot$total_paths_descriptives),
  HTMTDescriptives = mat(m6_boot$HTMT_descriptives),
  bootSummary = boot_summary_exports(summary(m6_boot))
))

# Resample index matrix: re-derive exactly what bootstrap_model used
# (estimate_bootstrap.R: set.seed(seed + i); sample.int(nrow(d), replace=TRUE))
n <- nrow(m1$rawdata)
indices <- t(vapply(seq_len(200), function(i) {
  set.seed(123 + i)
  sample.int(n, replace = TRUE)
}, integer(n)))

write_json(
  list(
    settings = list(description = "R resample indices (1-based rows) for M6: set.seed(123+i); sample.int(250, replace=TRUE)",
                    nboot = 200, seed = 123, n = n),
    indices = indices
  ),
  "tests/fixtures/expected/boot_indices.json",
  auto_unbox = TRUE
)
cat("wrote tests/fixtures/expected/boot_indices.json\n")

# ---------------------------------------------------------------------------
# M6b — bootstrap of M2 (full ECSI): exercises total *indirect* paths in the
# boot summary (M1 has none). nboot=100, seed=456, single core.
# ---------------------------------------------------------------------------

m6b_boot <- bootstrap_model(m2, nboot = 100, cores = 1, seed = 456)

write_fixture("M6b_bootstrap_ecsi", list(
  settings = list(
    description = "bootstrap_model on M2 (full ECSI): nboot=100, seed=456, cores=1, path_weighting",
    nboot = 100, seed = 456
  ),
  boots = m6b_boot$boots,
  pathsDescriptives = mat(m6b_boot$paths_descriptives),
  HTMTDescriptives = mat(m6b_boot$HTMT_descriptives),
  bootSummary = boot_summary_exports(summary(m6b_boot))
))

indices_m2 <- t(vapply(seq_len(100), function(i) {
  set.seed(456 + i)
  sample.int(n, replace = TRUE)
}, integer(n)))

write_json(
  list(
    settings = list(description = "R resample indices (1-based rows) for M6b: set.seed(456+i); sample.int(250, replace=TRUE)",
                    nboot = 100, seed = 456, n = n),
    indices = indices_m2
  ),
  "tests/fixtures/expected/boot_indices_m2.json",
  auto_unbox = TRUE
)
cat("wrote tests/fixtures/expected/boot_indices_m2.json\n")

# ---------------------------------------------------------------------------
# M7 — evaluation/validity suite fixtures (summary.seminr_model internals)
#
# One fixture per model so the M1..M6 files stay byte-identical. NAs are
# serialized as JSON null (na = "null" in write_fixture).
# ---------------------------------------------------------------------------

# named-vector list (item_vifs / antecedent_vifs) -> named JSON objects
vif_list <- function(vifs) lapply(unclass(vifs), function(v) as.list(unclass(v)))

eval_exports <- function(model) {
  mc <- constructs_in_model(model)
  d <- descriptives(model)
  list(
    reliability = mat(reliability(model)),
    htmt = mat(HTMT(model)),
    flCriteria = mat(fl_criteria_table(model, mc)),
    crossLoadings = mat(cross_loadings(model, mc)),
    itemVifs = vif_list(item_vifs(model, mc)),
    antecedentVifs = vif_list(antecedent_vifs(model$smMatrix, stats::cor(mc$construct_scores))),
    fSquare = mat(model_fsquares(model)),
    pathsReport = mat(report_paths(model)),
    totalEffects = mat(total_effects(model$path_coef)),
    totalIndirectEffects = mat(total_indirect_effects(model$path_coef)),
    itCriteria = mat(calculate_itcriteria(model)),
    descriptives = list(
      itemStatistics = mat(d$statistics$items),
      constructStatistics = mat(d$statistics$constructs),
      itemCorrelations = mat(d$correlations$items),
      constructCorrelations = mat(d$correlations$constructs)
    )
  )
}

write_eval_fixture <- function(name, description, model) {
  write_fixture(name, c(
    list(settings = list(description = description)),
    eval_exports(model)
  ))
}

write_eval_fixture("M7_evaluation_m1", "evaluation suite on M1 (basic composite)", m1)
write_eval_fixture("M7_evaluation_m2", "evaluation suite on M2 (full ECSI)", m2)
write_eval_fixture("M7_evaluation_m3", "evaluation suite on M3 (reflective PLSc)", m3)

m4pi_mm <- constructs(
  composite("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",  multi_items("CUEX", 1:3)),
  composite("Value",        multi_items("PERV", 1:2)),
  composite("Satisfaction", multi_items("CUSA", 1:3)),
  interaction_term(iv = "Image", moderator = "Expectation",
                   method = product_indicator, weights = mode_A)
)
m4pi <- estimate_pls(data = mobi, measurement_model = m4pi_mm, structural_model = m4_sm)
write_eval_fixture("M7_evaluation_m4pi",
                   "evaluation suite on M4 product_indicator interaction", m4pi)

write_eval_fixture("M7_evaluation_m5", "evaluation suite on M5 (HOC two-stage)", m5)

# ---------------------------------------------------------------------------
# M8 — PLSpredict (predict_pls) fixtures. The only RNG is the row shuffle
# drawn first inside predict_pls, so set.seed(S) immediately before the call
# pins the fold assignment; the same permutation is re-derived and exported
# as shuffleOrder (1-based) for the TS side.
# ---------------------------------------------------------------------------

predict_exports <- function(pred) {
  s <- summary(pred)
  list(
    compositesOutOfSample = mat(pred$composites$composite_out_of_sample),
    compositesInSample = mat(pred$composites$composite_in_sample),
    itemsOutOfSample = mat(pred$items$PLS_out_of_sample),
    itemsInSample = mat(pred$items$PLS_in_sample),
    lmOutOfSample = mat(pred$items$lm_out_of_sample),
    lmInSample = mat(pred$items$lm_in_sample),
    plsMetricsInSample = mat(s$PLS_in_sample),
    plsMetricsOutOfSample = mat(s$PLS_out_of_sample),
    lmMetricsInSample = mat(s$LM_in_sample),
    lmMetricsOutOfSample = mat(s$LM_out_of_sample),
    constructError = mat(s$construct_error)
  )
}

predict_fixture <- function(name, description, model, technique, technique_name,
                            seed, noFolds = 10) {
  set.seed(seed)
  pred <- predict_pls(model, technique = technique, noFolds = noFolds,
                      reps = NULL, cores = NULL)
  set.seed(seed)
  shuffle <- sample(nrow(model$data), nrow(model$data), replace = FALSE)
  write_fixture(name, c(
    list(settings = list(description = description, technique = technique_name,
                         noFolds = noFolds, seed = seed),
         shuffleOrder = list(shuffle)),
    predict_exports(pred)
  ))
}

m4ortho <- estimate_pls(data = mobi, structural_model = m4_sm, measurement_model = constructs(
  composite("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",  multi_items("CUEX", 1:3)),
  composite("Value",        multi_items("PERV", 1:2)),
  composite("Satisfaction", multi_items("CUSA", 1:3)),
  interaction_term(iv = "Image", moderator = "Expectation",
                   method = orthogonal, weights = mode_A)
))
m4ts <- estimate_pls(data = mobi, structural_model = m4_sm, measurement_model = constructs(
  composite("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",  multi_items("CUEX", 1:3)),
  composite("Value",        multi_items("PERV", 1:2)),
  composite("Satisfaction", multi_items("CUSA", 1:3)),
  interaction_term(iv = "Image", moderator = "Expectation",
                   method = two_stage, weights = mode_A)
))

predict_fixture("M8_predict_m1_da", "predict_pls on M1, predict_DA, 10 folds",
                m1, predict_DA, "DA", 789)
predict_fixture("M8_predict_m2_da", "predict_pls on M2 (full ECSI), predict_DA, 10 folds",
                m2, predict_DA, "DA", 789)
predict_fixture("M8_predict_m2_ea", "predict_pls on M2 (full ECSI), predict_EA, 10 folds",
                m2, predict_EA, "EA", 789)
predict_fixture("M8_predict_m4pi_da", "predict_pls on M4 product_indicator, predict_DA, 10 folds",
                m4pi, predict_DA, "DA", 790)
predict_fixture("M8_predict_m4ortho_da", "predict_pls on M4 orthogonal, predict_DA, 10 folds",
                m4ortho, predict_DA, "DA", 790)
predict_fixture("M8_predict_m4ts_da", "predict_pls on M4 two_stage, predict_DA, 10 folds",
                m4ts, predict_DA, "DA", 790)

# ---------------------------------------------------------------------------
# M9 — PLS-MGA on M2 (full ECSI), condition = CUEX1 < 8 (seminr's doc example).
# Both groups bootstrap with seed 123 (indices re-derivable per group size).
# ---------------------------------------------------------------------------

mga_condition <- mobi$CUEX1 < 8
m9_mga <- estimate_pls_mga(m2, mga_condition, nboot = 100, cores = 1, seed = 123)

write_fixture("M9_mga_ecsi", list(
  settings = list(
    description = "estimate_pls_mga on M2: condition CUEX1<8, nboot=100, seed=123, cores=1",
    nboot = 100, seed = 123,
    condition = list(as.integer(mga_condition)),
    group1N = sum(mga_condition), group2N = sum(!mga_condition)
  ),
  source = list(m9_mga$source),
  target = list(m9_mga$target),
  estimate = list(m9_mga$estimate),
  group1Beta = list(m9_mga$group1_beta),
  group2Beta = list(m9_mga$group2_beta),
  diff = list(m9_mga$diff),
  group1BetaMean = list(m9_mga$group1_beta_mean),
  group2BetaMean = list(m9_mga$group2_beta_mean),
  plsMgaP = list(m9_mga$pls_mga_p)
))

mga_indices <- function(n_group) {
  t(vapply(seq_len(100), function(i) {
    set.seed(123 + i)
    sample.int(n_group, replace = TRUE)
  }, integer(n_group)))
}
write_json(
  list(settings = list(description = "R resample indices (1-based) for M9 groups: set.seed(123+i); sample.int(nGroup, replace=TRUE)",
                       nboot = 100, seed = 123),
       group1 = mga_indices(sum(mga_condition)),
       group2 = mga_indices(sum(!mga_condition))),
  "tests/fixtures/expected/mga_indices.json",
  auto_unbox = TRUE
)
cat("wrote tests/fixtures/expected/mga_indices.json\n")

# ---------------------------------------------------------------------------
# M10 — missing-data strategies on M1: na.omit vs mean_replacement over the
# same induced NA cells (1-based rows 3,7 IMAG1; 15 CUEX2; 3,22 PERV1).
# Construct-score heads are exported positionally (na.omit drops rows, so
# original rownames would not align with sequential TS row names).
# ---------------------------------------------------------------------------

mobi_missing <- mobi
mobi_missing[c(3, 7), "IMAG1"] <- NA
mobi_missing[15, "CUEX2"] <- NA
mobi_missing[c(3, 22), "PERV1"] <- NA

missing_exports <- function(model) {
  scores <- model$construct_scores
  head5 <- scores[1:5, , drop = FALSE]
  rownames(head5) <- as.character(1:5)
  rep <- report_missing(model)
  list(
    pathCoef = mat(model$path_coef),
    outerLoadings = mat(model$outer_loadings),
    outerWeights = mat(model$outer_weights),
    rSquared = mat(model$rSquared),
    iterations = model$iterations,
    n = nrow(scores),
    constructScoresHead = mat(head5),
    constructScoresAbsMean = as.list(colMeans(abs(scores))),
    missingReport = list(
      method = rep$method,
      nRemoved = if (is.null(rep$n_removed)) NULL else rep$n_removed,
      variables = as.list(rep$summary$variable),
      missingCounts = as.list(rep$summary$missing_count)
    )
  )
}

m10_naomit <- estimate_pls(data = mobi_missing, measurement_model = m1_mm,
                           structural_model = m1_sm, missing = stats::na.omit)
write_fixture("M10_missing_naomit", c(
  list(settings = list(description = "M1 on mobi with NAs (rows 3,7 IMAG1; 15 CUEX2; 3,22 PERV1), missing = na.omit")),
  missing_exports(m10_naomit)
))

m10_meanrepl <- estimate_pls(data = mobi_missing, measurement_model = m1_mm,
                             structural_model = m1_sm)
write_fixture("M10_missing_meanrepl", c(
  list(settings = list(description = "M1 on mobi with the same NAs, missing = mean_replacement (default)")),
  missing_exports(m10_meanrepl)
))

# ---------------------------------------------------------------------------
# M11 — bootstrap mediation helpers on M6b (M2 ECSI bootstrap, nboot=100,
# seed=456): specific_effect_significance (direct + 1..4 serial mediators),
# total_indirect_ci, boot_paths_df (full replicate matrix).
# ---------------------------------------------------------------------------

ses_cases <- list(
  direct = list(from = "Image", through = NULL, to = "Loyalty"),
  one    = list(from = "Image", through = "Satisfaction", to = "Loyalty"),
  two    = list(from = "Image", through = c("Expectation", "Satisfaction"), to = "Loyalty"),
  three  = list(from = "Image", through = c("Expectation", "Satisfaction", "Complaints"), to = "Loyalty"),
  four   = list(from = "Image", through = c("Expectation", "Quality", "Satisfaction", "Complaints"), to = "Loyalty")
)

ses_export <- function(case) {
  res <- specific_effect_significance(m6b_boot, from = case$from,
                                      through = case$through, to = case$to)
  list(from = case$from,
       through = if (is.null(case$through)) list() else as.list(case$through),
       to = case$to,
       label = rownames(res)[[1]],
       columns = as.list(colnames(res)),
       values = as.list(as.numeric(res)))
}

tic_export <- function(from, to) {
  ci <- total_indirect_ci(m6b_boot, from = from, to = to)
  list(from = from, to = to, names = as.list(names(ci)), values = as.list(as.numeric(ci)))
}

m11_bp <- boot_paths_df(m6b_boot)
rownames(m11_bp) <- as.character(seq_len(nrow(m11_bp)))

write_fixture("M11_mediation", list(
  settings = list(
    description = "specific_effect_significance / total_indirect_ci / boot_paths_df on M6b (M2 bootstrap nboot=100 seed=456), alpha=0.05"
  ),
  specificEffects = lapply(ses_cases, ses_export),
  totalIndirectCis = list(
    imageLoyalty = tic_export("Image", "Loyalty"),
    expectationSatisfaction = tic_export("Expectation", "Satisfaction")
  ),
  bootPathsDf = mat(m11_bp)
))

# ---------------------------------------------------------------------------
# M12 — direct out-of-sample prediction (predict.seminr_model) with
# testData = mobi[1:20, ]: plain ECSI (DA + EA) and the three interaction
# methods (DA). No RNG anywhere in this path.
# ---------------------------------------------------------------------------

m12_test <- mobi[1:20, ]

direct_predict_exports <- function(model, technique) {
  pred <- predict(model, testData = m12_test, technique = technique)
  list(
    predictedItems = mat(pred$predicted_items),
    itemResiduals = mat(pred$item_residuals),
    predictedCompositeScores = mat(pred$predicted_composite_scores),
    compositeResiduals = mat(pred$composite_residuals),
    actualStar = mat(pred$actual_star)
  )
}

write_fixture("M12_direct_predict", list(
  settings = list(
    description = "predict(model, testData = mobi[1:20,]) on M2 (DA, EA) and M4 pi/ortho/two-stage (DA)",
    testRows = 20
  ),
  m2Da = direct_predict_exports(m2, predict_DA),
  m2Ea = direct_predict_exports(m2, predict_EA),
  m4piDa = direct_predict_exports(m4pi, predict_DA),
  m4orthoDa = direct_predict_exports(m4ortho, predict_DA),
  m4tsDa = direct_predict_exports(m4ts, predict_DA)
))

# ---------------------------------------------------------------------------
# META
# ---------------------------------------------------------------------------

seminr_desc <- read.dcf("../seminr/DESCRIPTION")
seminr_commit <- tryCatch(
  system("git -C ../seminr rev-parse HEAD", intern = TRUE),
  error = function(e) NA_character_
)
write_fixture("META", list(
  generatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  seminrVersion = unname(seminr_desc[1, "Version"]),
  seminrCommit = seminr_commit,
  rVersion = R.version.string,
  tolerance = 1e-5
))

cat("done\n")
