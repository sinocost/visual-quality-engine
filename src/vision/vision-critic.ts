import type { RemotionAutoSceneInput } from "../probe/probe-materializer.js";
import type {
  VisionCriterionAssessment,
  VisionCriterionId,
  VisionCriticFinding,
  VisionCriticFrameAssessment,
  VisionCriticInput,
  VisionCriticOptions,
  VisionCriticProvider,
  VisionCriticProviderFrameInput,
  VisionCriticProviderFrameOutput,
  VisionCriticReport,
} from "./vision-critic-types.js";

const DEFAULT_WEIGHTS = {
  primaryFocus: 0.3,
  hierarchy: 0.25,
  semanticRelevance: 0.3,
  attentionCompetition: 0.15,
} as const;

export interface VisionCriticFramePlanInput {
  availableFrames: number[];
  scenes: RemotionAutoSceneInput[];
  saliency: VisionCriticInput["saliency"];
  maxFrames?: number;
}

export class VisionCriticV1 {
  private readonly maxFrames: number;
  private readonly concurrency: number;
  private readonly warnBelow: number;
  private readonly majorBelow: number;

  constructor(
    private readonly provider: VisionCriticProvider,
    options: VisionCriticOptions = {},
  ) {
    this.maxFrames = Math.max(1, Math.floor(options.maxFrames ?? 8));
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
    this.warnBelow = clampScore(options.warnBelow ?? 75);
    this.majorBelow = Math.min(
      this.warnBelow,
      clampScore(options.majorBelow ?? 60),
    );
  }

  async analyze(input: VisionCriticInput): Promise<VisionCriticReport> {
    const requests = buildRequests(input, this.maxFrames);
    const assessments: VisionCriticFrameAssessment[] = [];
    const errors: Array<{ frame: number; message: string }> = [];
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= requests.length) return;
        const request = requests[index];
        try {
          const raw = await this.provider.evaluateFrame(request);
          assessments.push(
            sanitizeAssessment(request, this.provider.name, raw),
          );
        } catch (error) {
          errors.push({ frame: request.frame, message: errorMessage(error) });
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(this.concurrency, requests.length) },
        () => worker(),
      ),
    );

    assessments.sort((a, b) => a.frame - b.frame);
    errors.sort((a, b) => a.frame - b.frame);
    const findings = buildFindings(
      assessments,
      this.warnBelow,
      this.majorBelow,
    );
    const status =
      assessments.length === 0
        ? "unavailable"
        : errors.length
          ? "partial"
          : "completed";

    return {
      critic: "vision-critic-v1",
      provider: this.provider.name,
      status,
      framesRequested: requests.length,
      framesAnalyzed: assessments.length,
      aggregate: aggregateScores(assessments),
      findings,
      frames: assessments,
      errors,
    };
  }
}

export function planVisionCriticFrames(
  input: VisionCriticFramePlanInput,
): number[] {
  const available = [...new Set(input.availableFrames)].sort((a, b) => a - b);
  if (!available.length) return [];
  const preferred: number[] = [];

  // Guarantee broad scene coverage before spending budget on detail frames.
  for (const scene of input.scenes) {
    pushNearest(
      preferred,
      available,
      scene.fromFrame + Math.floor(scene.durationInFrames / 2),
    );
  }

  // Semantic event boundaries are more valuable than uniform frames.
  for (const scene of input.scenes) {
    for (const event of scene.keyEvents) {
      pushNearest(preferred, available, scene.fromFrame + event.frame);
    }
  }

  // Pixel-saliency gaps are candidates for semantic visual review.
  for (const frame of [...(input.saliency?.frames ?? [])].sort(
    (a, b) => a.coveredSaliencyRatio - b.coveredSaliencyRatio,
  )) {
    pushNearest(preferred, available, frame.frame);
  }

  pushNearest(preferred, available, available[0]);
  pushNearest(preferred, available, available[available.length - 1]);

  return preferred.slice(
    0,
    Math.max(1, Math.floor(input.maxFrames ?? 8)),
  );
}

function buildRequests(
  input: VisionCriticInput,
  maxFrames: number,
): VisionCriticProviderFrameInput[] {
  const capturedByFrame = new Map(
    input.frames.map((frame) => [frame.frame, frame]),
  );
  const probeByFrame = new Map(
    input.probeFrames.map((frame) => [frame.frame, frame]),
  );
  const available = [...capturedByFrame.keys()]
    .filter((frame) => probeByFrame.has(frame))
    .sort((a, b) => a - b);
  if (!available.length) return [];

  const preferred = planVisionCriticFrames({
    availableFrames: available,
    scenes: input.scenes,
    saliency: input.saliency,
    maxFrames,
  });

  return preferred.map((frame) => {
    const captured = capturedByFrame.get(frame)!;
    const probe = probeByFrame.get(frame)!;
    const scene = findScene(input.scenes, frame);
    const saliency = input.saliency?.frames.find((item) => item.frame === frame);

    return {
      frame,
      sceneId: scene?.id,
      sceneClaims: scene?.primaryClaims ?? [],
      image: captured.buffer,
      imageMimeType: "image/png" as const,
      elements: probe.elements
        .filter(
          (element) => element.visible && element.role !== "decorative",
        )
        .map((element) => ({
          id: element.id,
          role: element.role,
          text: truncate(element.typography?.text, 180),
          box: element.box,
          source: element.source,
          importanceScore: element.importanceScore,
          tagName: element.tagName,
        })),
      saliency: saliency
        ? {
            coveredSaliencyRatio: saliency.coveredSaliencyRatio,
            topUncoveredRegions: saliency.topUncoveredRegions,
          }
        : undefined,
    };
  });
}

function pushNearest(
  target: number[],
  available: number[],
  desired: number,
): void {
  let best = available[0];
  let distance = Math.abs(best - desired);
  for (const frame of available.slice(1)) {
    const current = Math.abs(frame - desired);
    if (current < distance || (current === distance && frame < best)) {
      best = frame;
      distance = current;
    }
  }
  if (!target.includes(best)) target.push(best);
}

function findScene(
  scenes: RemotionAutoSceneInput[],
  frame: number,
): RemotionAutoSceneInput | undefined {
  return scenes.find(
    (scene) =>
      scene.fromFrame <= frame &&
      frame < scene.fromFrame + scene.durationInFrames,
  );
}

function sanitizeAssessment(
  request: VisionCriticProviderFrameInput,
  provider: string,
  raw: VisionCriticProviderFrameOutput,
): VisionCriticFrameAssessment {
  const ids = new Set(request.elements.map((element) => element.id));
  return {
    frame: request.frame,
    sceneId: request.sceneId,
    provider,
    primaryFocus: sanitizeCriterion(raw.primaryFocus, ids),
    hierarchy: sanitizeCriterion(raw.hierarchy, ids),
    semanticRelevance: sanitizeCriterion(raw.semanticRelevance, ids),
    attentionCompetition: sanitizeCriterion(raw.attentionCompetition, ids),
  };
}

function sanitizeCriterion(
  raw: VisionCriterionAssessment,
  validIds: Set<string>,
): VisionCriterionAssessment {
  return {
    score: clampScore(raw?.score),
    confidence: clamp01(raw?.confidence),
    elementIds: [
      ...new Set(
        Array.isArray(raw?.elementIds)
          ? raw.elementIds.filter(
              (id) => typeof id === "string" && validIds.has(id),
            )
          : [],
      ),
    ],
    rationale:
      truncate(typeof raw?.rationale === "string" ? raw.rationale : "", 500) ??
      "",
    recommendation:
      truncate(
        typeof raw?.recommendation === "string" ? raw.recommendation : "",
        500,
      ) ?? "",
  };
}

function buildFindings(
  frames: VisionCriticFrameAssessment[],
  warnBelow: number,
  majorBelow: number,
): VisionCriticFinding[] {
  const findings: VisionCriticFinding[] = [];
  const mappings: Array<
    [
      VisionCriterionId,
      keyof Pick<
        VisionCriticFrameAssessment,
        | "primaryFocus"
        | "hierarchy"
        | "semanticRelevance"
        | "attentionCompetition"
      >,
    ]
  > = [
    ["primary-focus", "primaryFocus"],
    ["hierarchy", "hierarchy"],
    ["semantic-relevance", "semanticRelevance"],
    ["attention-competition", "attentionCompetition"],
  ];

  for (const frame of frames) {
    for (const [criterion, key] of mappings) {
      const assessment = frame[key];
      if (assessment.score >= warnBelow) continue;
      findings.push({
        frame: frame.frame,
        sceneId: frame.sceneId,
        criterion,
        severity: assessment.score < majorBelow ? "major" : "warning",
        score: assessment.score,
        confidence: assessment.confidence,
        elementIds: assessment.elementIds,
        message: assessment.rationale,
        recommendation: assessment.recommendation,
      });
    }
  }

  return findings.sort(
    (a, b) =>
      a.score - b.score ||
      a.frame - b.frame ||
      a.criterion.localeCompare(b.criterion),
  );
}

function aggregateScores(frames: VisionCriticFrameAssessment[]) {
  if (!frames.length) {
    return {
      overallScore: 0,
      primaryFocusScore: 0,
      hierarchyScore: 0,
      semanticRelevanceScore: 0,
      attentionCompetitionScore: 0,
    };
  }

  const primaryFocusScore = average(
    frames.map((frame) => frame.primaryFocus.score),
  );
  const hierarchyScore = average(frames.map((frame) => frame.hierarchy.score));
  const semanticRelevanceScore = average(
    frames.map((frame) => frame.semanticRelevance.score),
  );
  const attentionCompetitionScore = average(
    frames.map((frame) => frame.attentionCompetition.score),
  );

  return {
    overallScore: Math.round(
      primaryFocusScore * DEFAULT_WEIGHTS.primaryFocus +
        hierarchyScore * DEFAULT_WEIGHTS.hierarchy +
        semanticRelevanceScore * DEFAULT_WEIGHTS.semanticRelevance +
        attentionCompetitionScore * DEFAULT_WEIGHTS.attentionCompetition,
    ),
    primaryFocusScore: Math.round(primaryFocusScore),
    hierarchyScore: Math.round(hierarchyScore),
    semanticRelevanceScore: Math.round(semanticRelevanceScore),
    attentionCompetitionScore: Math.round(attentionCompetitionScore),
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: unknown): number {
  const number =
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(Math.max(0, Math.min(100, number)));
}

function clamp01(value: unknown): number {
  const number =
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, number));
}

function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
