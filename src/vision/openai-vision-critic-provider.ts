import type {
  VisionCriticProvider,
  VisionCriticProviderFrameInput,
  VisionCriticProviderFrameOutput,
} from "./vision-critic-types.js";

export interface OpenAIVisionCriticProviderOptions {
  apiKey: string;
  model: string;
  endpoint?: string;
  detail?: "low" | "high" | "auto";
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Reference provider using the OpenAI Responses API.
 * The caller supplies the model name so the engine is not coupled to a model lifecycle.
 */
export class OpenAIVisionCriticProvider implements VisionCriticProvider {
  readonly name: string;
  private readonly endpoint: string;
  private readonly detail: "low" | "high" | "auto";
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAIVisionCriticProviderOptions) {
    if (!options.apiKey) throw new Error("OpenAI vision critic requires apiKey");
    if (!options.model) throw new Error("OpenAI vision critic requires model");
    this.name = `openai:${options.model}`;
    this.endpoint = options.endpoint ?? "https://api.openai.com/v1/responses";
    this.detail = options.detail ?? "high";
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async evaluateFrame(
    input: VisionCriticProviderFrameInput,
  ): Promise<VisionCriticProviderFrameOutput> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.options.model,
          input: [
            {
              role: "developer",
              content: [{ type: "input_text", text: DEVELOPER_INSTRUCTIONS }],
            },
            {
              role: "user",
              content: [
                { type: "input_text", text: buildFramePrompt(input) },
                {
                  type: "input_image",
                  image_url: `data:${input.imageMimeType};base64,${encodeBase64(input.image)}`,
                  detail: this.detail,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "vqe_vision_critic_v1",
              strict: true,
              schema: OUTPUT_SCHEMA,
            },
          },
        }),
      });

      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `OpenAI Responses API ${response.status}: ${body.slice(0, 500)}`,
        );
      }

      const parsed = JSON.parse(body) as unknown;
      const text = extractOutputText(parsed);
      if (!text) {
        throw new Error("OpenAI Responses API returned no output_text content");
      }
      return JSON.parse(text) as VisionCriticProviderFrameOutput;
    } finally {
      clearTimeout(timeout);
    }
  }
}

const DEVELOPER_INSTRUCTIONS = [
  "You are an independent visual-quality critic for a professional technical explainer animation.",
  "Judge only the rendered frame and supplied semantic context.",
  "Scores are 0-100 and higher always means better visual quality.",
  "primaryFocus: one clear intended focal point; hierarchy: readable visual ordering;",
  "semanticRelevance: visual emphasis supports the scene claim; attentionCompetition: no unrelated element competes for attention.",
  "Only cite element IDs supplied in the context. Give concise actionable recommendations.",
].join(" ");

function buildFramePrompt(input: VisionCriticProviderFrameInput): string {
  return JSON.stringify({
    frame: input.frame,
    sceneId: input.sceneId ?? null,
    sceneClaims: input.sceneClaims,
    elements: input.elements.map((element) => ({
      id: element.id,
      role: element.role,
      text: element.text ?? null,
      box: element.box,
      source: element.source ?? null,
      importanceScore: element.importanceScore ?? null,
      tagName: element.tagName ?? null,
    })),
    saliency: input.saliency ?? null,
    instruction:
      "Evaluate the raw image using the four criteria. Use element IDs only when the supplied metadata lets you identify them confidently.",
  });
}

const ASSESSMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "score",
    "confidence",
    "elementIds",
    "rationale",
    "recommendation",
  ],
  properties: {
    score: { type: "number" },
    confidence: { type: "number" },
    elementIds: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
    recommendation: { type: "string" },
  },
} as const;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "primaryFocus",
    "hierarchy",
    "semanticRelevance",
    "attentionCompetition",
  ],
  properties: {
    primaryFocus: ASSESSMENT_SCHEMA,
    hierarchy: ASSESSMENT_SCHEMA,
    semanticRelevance: ASSESSMENT_SCHEMA,
    attentionCompetition: ASSESSMENT_SCHEMA,
  },
} as const;

function extractOutputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const output = (value as { output?: unknown }).output;
  if (!Array.isArray(output)) return undefined;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as { type?: unknown; text?: unknown };
      if (record.type === "output_text" && typeof record.text === "string") {
        return record.text;
      }
    }
  }
  return undefined;
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    output += i + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return output;
}
