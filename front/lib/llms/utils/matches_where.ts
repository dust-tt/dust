import type {
  AnyValueFilter,
  ArrayValueFilter,
  LogicalFilters,
  ScalarValueFilter,
  Where,
} from "@app/lib/llms/types/filter";
import { isRecord } from "@app/types/shared/utils/general";
import isObject from "lodash/isObject";

export function matchesWhere<T extends object>(
  item: T,
  where: Where<T>
): boolean {
  const { and, or, not, ...fieldFilters } = where;

  if (and?.some((child) => !matchesWhere(item, child))) {
    return false;
  }

  if (or && !or.some((child) => matchesWhere(item, child))) {
    return false;
  }

  if (not && matchesWhere(item, not)) {
    return false;
  }

  return matchesFieldFilters(item, fieldFilters);
}

function matchesFieldFilters<T extends object>(
  item: T,
  fieldFilters: Omit<Where<T>, keyof LogicalFilters<T>>
): boolean {
  const keys = Object.keys(fieldFilters) as Array<keyof typeof fieldFilters>;
  for (const key of keys) {
    const value = item[key];
    const filter = fieldFilters[key];

    if (!matchesValueFilter(value, filter)) {
      return false;
    }
  }

  return true;
}

function matchesValueFilter(
  value: unknown,
  filter: AnyValueFilter | undefined
): boolean {
  if (!isObject(filter) || !isRecord(filter)) {
    return true;
  }

  if (Array.isArray(value)) {
    return matchesArrayFilter(value, filter);
  }

  return matchesScalarFilter(value, filter);
}

function matchesArrayFilter(
  value: unknown[],
  filter: ArrayValueFilter<unknown>
): boolean {
  if (filter.contains !== undefined && !value.includes(filter.contains)) {
    return false;
  }

  if (
    filter.containsAny !== undefined &&
    !filter.containsAny.some((candidate) => value.includes(candidate))
  ) {
    return false;
  }

  if (
    filter.containsAll !== undefined &&
    !filter.containsAll.every((candidate) => value.includes(candidate))
  ) {
    return false;
  }

  return true;
}

function matchesScalarFilter(
  value: unknown,
  filter: ScalarValueFilter<unknown>
): boolean {
  if (filter.eq !== undefined && value !== filter.eq) {
    return false;
  }

  if (filter.in !== undefined && !filter.in.includes(value)) {
    return false;
  }

  return true;
}
