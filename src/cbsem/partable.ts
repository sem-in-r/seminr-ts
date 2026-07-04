/**
 * Free-parameter table for covariance-based models, replicating lavaan's flat
 * parameter table under seminr's call (std.lv=TRUE, no meanstructure, single
 * group): all loadings free, every latent (residual) variance fixed to 1,
 * auto covariances for exogenous-latent pairs and pure-outcome pairs, item
 * residual variances free (single-item constructs fixed to 0), plus any
 * user item-error covariances.
 */

import type { MmMatrix } from "../model/mmMatrix.ts";
import type { SmMatrix } from "../model/smMatrix.ts";
import {
  associationItems,
  associationPairs,
  type ItemAssociations,
} from "../specify/associations.ts";

export type ParamMatrixName = "lambda" | "theta" | "psi" | "beta";

export type ParamOp = "=~" | "~" | "~~";

export interface ParTableRow {
  id: number;
  lhs: string;
  op: ParamOp;
  rhs: string;
  /** lavaan free index (1-based); 0 for fixed parameters. */
  free: number;
}

/** Location of a free parameter inside the LISREL model matrices. */
export interface FreeParamRef {
  matrix: ParamMatrixName;
  row: number;
  col: number;
  /** The parameter-table row this parameter came from. */
  lhs: string;
  op: ParamOp;
  rhs: string;
}

export interface CbsemParTable {
  latents: string[];
  observed: string[];
  rows: ParTableRow[];
  /** Free parameters in lavaan free-index order (freeParams[k] has free index k+1). */
  freeParams: FreeParamRef[];
  /** Observed variables carrying a fixed-zero residual variance (single-item constructs). */
  fixedZeroThetaDiag: number[];
  /** Latents measured only through beta (higher-order dims) — none in plain models. */
  structuralModel?: SmMatrix;
}

export interface ParTableParts {
  mmMatrix: MmMatrix;
  structuralModel?: SmMatrix;
  itemAssociations?: ItemAssociations | null;
}

export function buildParTable(parts: ParTableParts): CbsemParTable {
  const { mmMatrix, structuralModel, itemAssociations } = parts;
  const latents = mmMatrix.allConstructs();
  const latentSet = new Set(latents);

  // Observed vars: mm items in row order (skipping latent "items" of HOCs),
  // then association-only variables in appearance order.
  const observed: string[] = [];
  const observedSet = new Set<string>();
  for (const row of mmMatrix.toRows()) {
    if (latentSet.has(row.measurement)) continue;
    if (!observedSet.has(row.measurement)) {
      observedSet.add(row.measurement);
      observed.push(row.measurement);
    }
  }
  for (const item of associationItems(itemAssociations)) {
    if (!latentSet.has(item) && !observedSet.has(item)) {
      observedSet.add(item);
      observed.push(item);
    }
  }

  const latentIndex = new Map(latents.map((l, i) => [l, i] as const));
  const observedIndex = new Map(observed.map((o, i) => [o, i] as const));

  const rows: ParTableRow[] = [];
  const freeParams: FreeParamRef[] = [];
  const fixedZeroThetaDiag: number[] = [];
  let id = 0;
  let free = 0;

  const addFree = (lhs: string, op: ParamOp, rhs: string, ref: Omit<FreeParamRef, "lhs" | "op" | "rhs">) => {
    rows.push({ id: ++id, lhs, op, rhs, free: ++free });
    freeParams.push({ ...ref, lhs, op, rhs });
  };
  const addFixed = (lhs: string, op: ParamOp, rhs: string) => {
    rows.push({ id: ++id, lhs, op, rhs, free: 0 });
  };

  // 1. Measurement blocks in mm order; single-item error fixed to zero inline.
  for (const construct of latents) {
    const items = mmMatrix.constructItems(construct);
    const col = latentIndex.get(construct)!;
    for (const item of items) {
      if (latentSet.has(item)) {
        // Higher-order measurement: dim = b * HOC lives in beta[dim, HOC].
        addFree(construct, "=~", item, {
          matrix: "beta",
          row: latentIndex.get(item)!,
          col,
        });
      } else {
        addFree(construct, "=~", item, {
          matrix: "lambda",
          row: observedIndex.get(item)!,
          col,
        });
      }
    }
    if (items.length === 1 && !latentSet.has(items[0]!)) {
      const idx = observedIndex.get(items[0]!)!;
      addFixed(items[0]!, "~~", items[0]!);
      fixedZeroThetaDiag.push(idx);
    }
  }

  // 2. Regressions per endogenous construct in target order.
  if (structuralModel && !structuralModel.isEmpty()) {
    for (const outcome of structuralModel.allEndogenous()) {
      for (const source of structuralModel.constructAntecedents(outcome)) {
        addFree(outcome, "~", source, {
          matrix: "beta",
          row: latentIndex.get(outcome)!,
          col: latentIndex.get(source)!,
        });
      }
    }
  }

  // 3. User item-error covariances. lavaanify reorients each pair to model
  //    declaration order (earlier observed variable on the lhs), regardless of
  //    the alphabetical order used in the syntax string.
  for (const pair of associationPairs(itemAssociations)) {
    const [a, b] =
      observedIndex.get(pair[0])! <= observedIndex.get(pair[1])! ? pair : [pair[1], pair[0]];
    addFree(a, "~~", b, {
      matrix: "theta",
      row: observedIndex.get(a)!,
      col: observedIndex.get(b)!,
    });
  }

  // 4. Auto residual variances for observed vars not already fixed.
  const fixedDiag = new Set(fixedZeroThetaDiag);
  for (const ov of observed) {
    const idx = observedIndex.get(ov)!;
    if (fixedDiag.has(idx)) continue;
    addFree(ov, "~~", ov, { matrix: "theta", row: idx, col: idx });
  }

  // 5. Latent variances all fixed to 1 (std.lv), endogenous included.
  for (const latent of latents) addFixed(latent, "~~", latent);

  // 6. Free latent covariances: exogenous pairs, then pure-outcome pairs.
  //    Endogenous = target of a regression or a higher-order dimension.
  const endogenous = new Set<string>();
  const regressionSources = new Set<string>();
  const regressionTargets = new Set<string>();
  for (const dim of mmMatrix.rowsForItems(latents).allItems()) endogenous.add(dim);
  if (structuralModel) {
    for (const target of structuralModel.allEndogenous()) {
      endogenous.add(target);
      regressionTargets.add(target);
    }
    for (const source of structuralModel.allExogenous()) regressionSources.add(source);
  }
  const exogenous = latents.filter((l) => !endogenous.has(l));
  for (let i = 0; i < exogenous.length; i++) {
    for (let j = i + 1; j < exogenous.length; j++) {
      addFree(exogenous[i]!, "~~", exogenous[j]!, {
        matrix: "psi",
        row: latentIndex.get(exogenous[i]!)!,
        col: latentIndex.get(exogenous[j]!)!,
      });
    }
  }
  // Pure outcomes: regression targets that are never predictors nor HOC dims.
  const hocDims = new Set(mmMatrix.rowsForItems(latents).allItems());
  const pureY = latents.filter(
    (l) => regressionTargets.has(l) && !regressionSources.has(l) && !hocDims.has(l),
  );
  for (let i = 0; i < pureY.length; i++) {
    for (let j = i + 1; j < pureY.length; j++) {
      addFree(pureY[i]!, "~~", pureY[j]!, {
        matrix: "psi",
        row: latentIndex.get(pureY[i]!)!,
        col: latentIndex.get(pureY[j]!)!,
      });
    }
  }

  return { latents, observed, rows, freeParams, fixedZeroThetaDiag, structuralModel };
}
