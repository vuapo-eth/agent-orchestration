"use client";

import { memo, createContext, useContext } from "react";
import type { EdgeProps } from "reactflow";
import { getSmoothStepPath, getBezierPath, getStraightPath, BaseEdge } from "reactflow";

export type EdgePathMode = "curved" | "straight" | "smoothstep";

const EdgePathModeContext = createContext<EdgePathMode>("smoothstep");

export function use_edge_path_mode() {
  return useContext(EdgePathModeContext);
}

export const EdgePathModeProvider = EdgePathModeContext.Provider;

function get_path_for_mode(
  mode: EdgePathMode,
  params: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: string;
    targetPosition: string;
  }
) {
  const base = {
    sourceX: params.sourceX,
    sourceY: params.sourceY,
    targetX: params.targetX,
    targetY: params.targetY,
    sourcePosition: params.sourcePosition as "left" | "right" | "top" | "bottom",
    targetPosition: params.targetPosition as "left" | "right" | "top" | "bottom",
  };
  if (mode === "curved") {
    return getBezierPath({ ...base, curvature: 0.25 });
  }
  if (mode === "straight") {
    return getStraightPath({
      sourceX: params.sourceX,
      sourceY: params.sourceY,
      targetX: params.targetX,
      targetY: params.targetY,
    });
  }
  return getSmoothStepPath({ ...base, borderRadius: 5 });
}

function DagEdgeInner(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
  } = props;

  const mode = use_edge_path_mode();
  const [path] = get_path_for_mode(mode, {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: sourcePosition ?? "right",
    targetPosition: targetPosition ?? "left",
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerEnd={markerEnd}
    />
  );
}

export const DagEdge = memo(DagEdgeInner);
