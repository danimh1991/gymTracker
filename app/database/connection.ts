import { env } from "cloudflare:workers";
import { D1TrainingRepository } from "../repositories/d1TrainingRepository";
export function repository(profileId: string, demo = false) {
  if (!env.DB) throw new Error("Base de datos no disponible.");
  return new D1TrainingRepository(
    env.DB,
    `${profileId}:${demo ? "demo" : "real"}`,
    demo,
    profileId,
  );
}
