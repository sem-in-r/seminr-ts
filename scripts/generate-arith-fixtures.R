# Generate conformance fixtures for R's arithmetic means, SD and variance.
#
# Usage:  Rscript scripts/generate-arith-fixtures.R
# Requires: a local R with jsonlite, and tests/fixtures/data/mobi.csv.
#
# Output (committed — it is the test contract):
#   tests/fixtures/expected/arith.json
#
# WHY THIS FILE EXISTS
#
# R has three means and this fixture pins all of them, because seminr-ts
# delegates `mean` to @compstats/core and only *some* of its call sites port
# the R function that delegation actually implements.
#
#   1. mean(<double>)  -> do_mean, REALSXP branch (src/main/summary.c).
#      Sums, divides, then makes a SECOND pass adding the mean of the
#      residuals back. The residuals are measured against the *rounded* first
#      pass, so their sum recovers the error it accumulated. This is what
#      @compstats/core 0.7.0 computes.
#   2. colMeans()      -> do_colsum (src/main/array.c). One pass. No
#      correction. This is what R's scale() centres on, and therefore what
#      seminr's standardize_safely() centres on.
#   3. mean(<integer>) -> do_mean, INTSXP branch. ALSO one pass: the
#      correction is in the REALSXP branch only. So on integer input `mean`
#      *is* `colMeans` -- and every bundled seminr dataset is integer.
#
# sd() and var() are not ambiguous: R coerces to double and cov.c's corrected
# MEAN macro runs either way, so integer and double input give identical
# answers. Only `mean` needs the storage mode asked about.
#
# EXACTNESS
#
# Every value here is asserted with toBe / Object.is, not a tolerance, which
# is only sound because capabilities("long.double") is FALSE on this platform:
# R's LDOUBLE accumulators are then plain doubles and a TS left fold can match
# them bit for bit. The flag is recorded below and the test asserts it before
# asserting anything else, so the claim cannot silently stop being true on a
# platform where R accumulates in 80-bit registers.

library(jsonlite)

stopifnot(file.exists("tests/fixtures/data/mobi.csv"))
dir.create("tests/fixtures/expected", recursive = TRUE, showWarnings = FALSE)

naive_mean <- function(x) sum(x) / length(x)

# ---------------------------------------------------------------------------
# 1. mobi columns, in both storage modes
# ---------------------------------------------------------------------------

mobi_int <- as.matrix(read.csv("tests/fixtures/data/mobi.csv"))
stopifnot(storage.mode(mobi_int) == "integer")
mobi_dbl <- mobi_int
storage.mode(mobi_dbl) <- "double"

# seminr's standardize_safely (compute_safe.R:14-18) does NOT use sd(). It
# centres on colMeans and takes the scale from those same residuals:
#   res <- x - rep(center, each = n)
#   scl <- sqrt(colSums(res * res) / max(1L, n - 1L))
# sd() centres on the CORRECTED mean instead, so the two part company on 5 of
# mobi's 24 columns. Pinned separately so a port cannot quietly substitute one.
n_mobi <- nrow(mobi_dbl)
safely_center <- colMeans(mobi_dbl)
safely_res <- mobi_dbl - rep(safely_center, each = n_mobi)
safely_scale <- sqrt(colSums(safely_res * safely_res) / max(1L, n_mobi - 1L))

mobi_cols <- lapply(colnames(mobi_int), function(nm) {
  xi <- mobi_int[, nm]
  xd <- mobi_dbl[, nm]
  list(
    column        = nm,
    meanInteger   = mean(xi),        # do_mean INTSXP  -- uncorrected
    meanDouble    = mean(xd),        # do_mean REALSXP -- corrected
    colMeans      = colMeans(mobi_dbl[, nm, drop = FALSE])[[1]],
    naive         = naive_mean(xd),
    sd            = sd(xd),
    var           = var(xd),
    sdInteger     = sd(xi),
    safelyScale   = safely_scale[[nm]],
    correctionMoves = !identical(mean(xd), naive_mean(xd)),
    scaleDiffersFromSd = !identical(safely_scale[[nm]], sd(xd))
  )
})

moved <- vapply(mobi_cols, function(r) r$correctionMoves, logical(1))

# ---------------------------------------------------------------------------
# 2. A synthetic double vector chosen BECAUSE the naive form fails on it
#
# A fixture picked for convenience is green through the entire life of the
# defect it was meant to catch -- that is how this whole class of bug survived
# three packages. So sweep seeds and keep the first whose corrected and naive
# means differ, and keep the vector itself so the TS side folds the same data.
# ---------------------------------------------------------------------------

sweep_seed <- NA_integer_
for (seed in 1:10000) {
  set.seed(seed)
  cand <- runif(97, -500, 500)
  if (!identical(mean(cand), naive_mean(cand))) { sweep_seed <- seed; break }
}
stopifnot(!is.na(sweep_seed))
set.seed(sweep_seed)
swept <- runif(97, -500, 500)

# How often the two forms disagree at all, so the fixture records the rate the
# claim rests on rather than leaving it as an assertion in prose.
set.seed(20260902)
trials <- 20000
disagree <- sum(vapply(seq_len(trials), function(i) {
  v <- runif(sample(50:300, 1), -500, 500)
  !identical(mean(v), naive_mean(v))
}, logical(1)))

# ---------------------------------------------------------------------------
# 3. The pinned bootstrap-shaped sample already in the repo
# ---------------------------------------------------------------------------

boot_sample <- fromJSON("tests/fixtures/data/quantile-sample.json")
stopifnot(is.numeric(boot_sample), length(boot_sample) == 500)

# ---------------------------------------------------------------------------

write_json(
  list(
    generatedAt   = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
    rVersion      = R.version.string,
    longDouble    = capabilities("long.double"),
    mobi = list(
      columns          = mobi_cols,
      columnCount      = ncol(mobi_int),
      correctionMovesCount = sum(moved),
      correctionMovesCols  = colnames(mobi_int)[moved],
      scaleDiffersFromSdCount = sum(safely_scale != apply(mobi_dbl, 2, sd)),
      scaleDiffersFromSdCols  = colnames(mobi_int)[safely_scale != apply(mobi_dbl, 2, sd)]
    ),
    swept = list(
      seed   = sweep_seed,
      values = swept,
      mean   = mean(swept),
      naive  = naive_mean(swept),
      sd     = sd(swept),
      var    = var(swept)
    ),
    disagreementRate = list(
      trials = trials,
      differing = disagree
    ),
    bootstrapSample = list(
      n     = length(boot_sample),
      mean  = mean(boot_sample),
      naive = naive_mean(boot_sample),
      sd    = sd(boot_sample)
    )
  ),
  "tests/fixtures/expected/arith.json",
  # digits = I(17): seventeen SIGNIFICANT digits, which round-trips an IEEE-754
  # double exactly. NOT digits = NA -- despite the "max precision" wording that
  # gives 15 significant digits here, which silently truncates the last two and
  # makes every Object.is assertion below unsatisfiable.
  digits = I(17), auto_unbox = TRUE, pretty = TRUE
)

cat("wrote tests/fixtures/expected/arith.json\n")
cat("  long.double:", capabilities("long.double"), "\n")
cat("  mobi columns where the correction moves the mean:", sum(moved), "of", ncol(mobi_int), "\n")
cat("  sweep seed:", sweep_seed, "\n")
cat("  disagreement rate:", disagree, "of", trials, "\n")
