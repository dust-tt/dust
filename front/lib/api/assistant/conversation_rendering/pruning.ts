/**
 * Pruning strategies for tool results in conversation rendering
 */

import type { FunctionMessageTypeModel } from "@app/types";

export interface PruningContext {
  interactionIndex: number;
  totalInteractions: number;
  isLastInteraction: boolean;
  messageIndex: number;
  totalMessagesInInteraction: number;
}

export interface PruningStrategy {
  shouldPruneToolResult(
    result: FunctionMessageTypeModel,
    context: PruningContext
  ): boolean;
}

/**
 * Prunes all tool results from previous interactions
 */
export class PreviousInteractionsPruning implements PruningStrategy {
  shouldPruneToolResult(
    result: FunctionMessageTypeModel,
    context: PruningContext
  ): boolean {
    // Prune all tool results that are not in the last interaction
    return !context.isLastInteraction;
  }
}

/**
 * Prunes tool results within the current interaction based on position
 */
export class CurrentInteractionPruning implements PruningStrategy {
  constructor(private keepLastN: number = 2) {}

  shouldPruneToolResult(
    result: FunctionMessageTypeModel,
    context: PruningContext
  ): boolean {
    // Only apply to the last interaction
    if (!context.isLastInteraction) {
      return false;
    }

    // Keep the last N tool results in the current interaction
    const fromEnd = context.totalMessagesInInteraction - context.messageIndex;
    return fromEnd > this.keepLastN;
  }
}

/**
 * Combines multiple pruning strategies
 */
export class CombinedPruning implements PruningStrategy {
  constructor(private strategies: PruningStrategy[]) {}

  shouldPruneToolResult(
    result: FunctionMessageTypeModel,
    context: PruningContext
  ): boolean {
    return this.strategies.some((strategy) =>
      strategy.shouldPruneToolResult(result, context)
    );
  }
}