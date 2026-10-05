"use client";

import { useEffect, useState } from "react";
import { Activity, LockKeyhole, ShieldCheck } from "lucide-react";
import { appPath } from "../lib/base-path";
import Tracker from "./Tracker";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./ui/input-otp";

const pinEndpoint = appPath("/api/auth/pin");

export default function PinGate() {
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">(
    "checking",
  );
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(pinEndpoint, { cache: "no-store", signal: controller.signal })
      .then((response) => setStatus(response.ok ? "unlocked" : "locked"))
      .catch((requestError: unknown) => {
        if (
          !(requestError instanceof DOMException && requestError.name === "AbortError")
        ) {
          setStatus("locked");
        }
      });
    return () => controller.abort();
  }, []);

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin.length !== 4) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(pinEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se ha podido comprobar el PIN.");
        setPin("");
        return;
      }
      setStatus("unlocked");
    } catch {
      setError("No se ha podido comprobar el PIN. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function lock() {
    await fetch(pinEndpoint, { method: "DELETE" }).catch(() => undefined);
    setPin("");
    setError("");
    setStatus("locked");
  }

  if (status === "unlocked") return <Tracker onLock={lock} />;

  return (
    <main className="pin-screen">
      <section className="pin-card">
        <span className="pin-brand" aria-hidden="true">
          <Activity size={30} />
        </span>
        <p className="pin-app-name">
          GYM<span>TRACKER</span>
        </p>
        {status === "checking" ? (
          <div className="pin-checking" role="status">
            <span className="pin-spinner" />
            <p>Comprobando acceso…</p>
          </div>
        ) : (
          <form onSubmit={unlock} className="pin-form">
            <span className="pin-lock" aria-hidden="true">
              <LockKeyhole size={21} />
            </span>
            <h1>Introduce tu PIN</h1>
            <p>Accede a tus entrenamientos y a tu progreso.</p>
            <InputOTP
              autoFocus
              maxLength={4}
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(value) => {
                setPin(value.replace(/\D/g, ""));
                setError("");
              }}
              disabled={submitting}
              aria-label="PIN de cuatro cifras"
              aria-invalid={Boolean(error)}
              containerClassName="pin-input"
            >
              <InputOTPGroup className="pin-input-group">
                {[0, 1, 2, 3].map((index) => (
                  <InputOTPSlot key={index} index={index} className="pin-slot" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <div className="pin-error" aria-live="polite">
              {error && <p>{error}</p>}
            </div>
            <button
              type="submit"
              className="pin-submit"
              disabled={pin.length !== 4 || submitting}
            >
              <ShieldCheck size={18} />
              {submitting ? "Comprobando…" : "Acceder"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
