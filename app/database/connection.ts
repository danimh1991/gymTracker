import { env } from "cloudflare:workers";
import { D1TrainingRepository } from "../repositories/d1TrainingRepository";
export function repository(ownerId: string, demo = false) {
  if (!env.DB) throw new Error("Base de datos no disponible.");
  return new D1TrainingRepository(
    env.DB,
    `${ownerId}:${demo ? "demo" : "real"}`,
    demo,
  );
}
