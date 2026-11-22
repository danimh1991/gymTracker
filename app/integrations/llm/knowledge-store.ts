export const LLM_KNOWLEDGE_PREFIX = "gym-tracker/v1";
export const LLM_MANIFEST_KEY = `${LLM_KNOWLEDGE_PREFIX}/manifest.json`;

export type LlmKnowledgeKind =
  | "catalog"
  | "guidance"
  | "profile"
  | "schema"
  | "session"
  | "summary";

export interface LlmKnowledgeEntry {
  key: string;
  kind: LlmKnowledgeKind;
  contentType: "application/json" | "text/markdown";
  version: number;
  updatedAt: string;
  checksum?: string;
}

export interface LlmKnowledgeManifest {
  schemaVersion: 1;
  generatedAt: string;
  entries: LlmKnowledgeEntry[];
}

export class LlmKnowledgeStore {
  constructor(private readonly bucket: R2Bucket) {}

  async readManifest(): Promise<LlmKnowledgeManifest | null> {
    const object = await this.bucket.get(LLM_MANIFEST_KEY);
    if (!object) return null;
    return validateManifest(await object.json());
  }

  async readText(key: string): Promise<string | null> {
    if (!key.startsWith(`${LLM_KNOWLEDGE_PREFIX}/`) || key.includes(".."))
      throw new Error("Clave R2 de conocimiento no válida.");
    const object = await this.bucket.get(key);
    return object ? object.text() : null;
  }

  async writeManifest(manifest: LlmKnowledgeManifest) {
    const validated = validateManifest(manifest);
    await this.bucket.put(
      LLM_MANIFEST_KEY,
      JSON.stringify(validated, null, 2),
      {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: { schemaVersion: String(validated.schemaVersion) },
      },
    );
  }

  async putJson(relativeKey: string, value: unknown) {
    const key = knowledgeKey(relativeKey);
    await this.bucket.put(key, JSON.stringify(value, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    return key;
  }

  async putMarkdown(relativeKey: string, value: string) {
    const key = knowledgeKey(relativeKey);
    await this.bucket.put(key, value, {
      httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    });
    return key;
  }
}

export function knowledgeKey(relativeKey: string) {
  const normalized = relativeKey.trim().replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    !/^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,511}$/.test(normalized)
  ) {
    throw new Error("Clave R2 de conocimiento no válida.");
  }
  return `${LLM_KNOWLEDGE_PREFIX}/${normalized}`;
}

function validateManifest(value: unknown): LlmKnowledgeManifest {
  if (!value || typeof value !== "object")
    throw new Error("Manifiesto R2 no válido.");
  const manifest = value as Partial<LlmKnowledgeManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.generatedAt !== "string" ||
    !validDate(manifest.generatedAt) ||
    !Array.isArray(manifest.entries) ||
    !manifest.entries.every(validEntry)
  ) {
    throw new Error("Versión o estructura del manifiesto R2 no válida.");
  }
  return manifest as LlmKnowledgeManifest;
}

function validEntry(value: unknown): value is LlmKnowledgeEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<LlmKnowledgeEntry>;
  return (
    typeof entry.key === "string" &&
    entry.key.startsWith(`${LLM_KNOWLEDGE_PREFIX}/`) &&
    !entry.key.includes("..") &&
    ["catalog", "guidance", "profile", "schema", "session", "summary"].includes(
      entry.kind ?? "",
    ) &&
    ["application/json", "text/markdown"].includes(entry.contentType ?? "") &&
    Number.isInteger(entry.version) &&
    (entry.version ?? 0) > 0 &&
    typeof entry.updatedAt === "string" &&
    validDate(entry.updatedAt) &&
    (entry.checksum === undefined || typeof entry.checksum === "string")
  );
}

function validDate(value: string) {
  return !Number.isNaN(Date.parse(value));
}
