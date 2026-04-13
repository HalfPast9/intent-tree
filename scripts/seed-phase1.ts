import path from "node:path";
import { fileURLToPath } from "node:url";

import { createProblemSpec } from "../src/db/index";
import { connectNeo4j, disconnectNeo4j } from "../src/db/client";
import { resetDb } from "./reset-db";

export const problemSpec = {
  id: "spec-url-shortener",
  problem_statement:
    "Build a URL shortening service that accepts arbitrary long URLs submitted via an HTTP API, generates a short alphanumeric code uniquely mapped to that URL, persists the mapping durably, and redirects any HTTP client that resolves the short code to the original destination URL via an HTTP 301 or 302 response. The service is the authoritative source of truth for all short code -> URL mappings and must never lose or corrupt a mapping once written.",
  hard_constraints: `- Short codes must be globally unique - no two distinct URLs may share the same short code at any point in time, including under concurrent write load.
- Short codes are exactly 7 characters, drawn from the base-62 alphabet (a-z, A-Z, 0-9). No special characters, no ambiguous characters (no leniency needed - strict base-62 only).
- Redirect latency must be under 50ms at p99, measured from the moment the HTTP request is received at the service edge to the moment the HTTP redirect response is sent. This is a hard SLO, not a target.
- The system must sustain a steady-state write throughput of at least 500 URL shortenings per second and a peak read throughput of at least 10,000 redirects per second, both without SLO degradation.
- Short code generation must complete in under 200ms end-to-end (API call to response), including persistence.
- A resolved short code must always return the correct original URL - zero tolerance for incorrect resolution. Stale reads that return a previously correct mapping are acceptable during brief propagation windows; returning a wrong mapping is not.
- The system must not lose any persisted mapping. Durability is non-negotiable - a write that returned success to the caller must survive node failure.`,
  optimization_targets: `- Minimize p99 redirect latency - push it as far below the 50ms hard floor as the architecture allows. The redirect path is the hot path; everything else is secondary.
- Maximize redirect read throughput - the system should scale redirect capacity horizontally without architectural changes.
- Minimize storage cost per stored URL mapping - storage is the dominant long-term cost driver; the design should avoid over-replication or redundant index structures where possible.
- Minimize short code generation latency - sub-100ms is the target even though 200ms is the hard ceiling.
- Minimize operational complexity - prefer managed services and stateless components where they don't compromise the above; the system should be operable without deep per-component expertise.`,
  success_criteria: `- A short code returned to the caller always resolves to the exact original URL submitted - measured across 100% of resolutions under load testing with no incorrect resolutions permitted.
- p99 redirect latency is under 50ms under a simulated load of 10,000 requests/second, measured at the service edge.
- p99 short code generation latency is under 200ms under a simulated write load of 500 requests/second.
- The system sustains 10,000 redirects/second for a minimum of 10 continuous minutes without SLO degradation or error rate exceeding 0.1%.
- No mapping loss is observed after simulating a single-node failure mid-write - any write that returned HTTP 2xx to the caller must be recoverable post-failover.
- Duplicate short code collisions are zero across a test suite of 1 million concurrent code generation requests.
- The system recovers to full availability within 30 seconds of a single application node failure, with no client-visible data loss.`,
  out_of_scope: `- User accounts, authentication, authorization, or API key management of any kind.
- Link expiry, TTLs, or scheduled deletion of mappings.
- Custom slugs or vanity URLs - callers cannot specify their own short code.
- Click tracking, analytics, or any telemetry on redirect events beyond operational metrics (latency, error rate, throughput).
- Geo-routing, latency-based routing, or region-aware redirect targets.
- Abuse detection, spam filtering, or URL validation beyond basic format checks.
- URL previews, QR code generation, or any non-redirect consumer features.
- Rate limiting per caller or per URL - out of scope for V1.
- Admin UI, dashboard, or management interface.
- Multi-tenancy - the service is single-tenant.
- GDPR / data residency compliance - not a requirement for this version.`,
  assumptions: `- The service is cloud-hosted on a major cloud provider (AWS, GCP, or Azure) with access to managed infrastructure primitives (managed databases, load balancers, CDN, object storage).
- Application server tier is stateless - no in-process state that must survive a server restart. All durable state lives in external storage.
- Traffic is heavily read-skewed: assume a 20:1 read-to-write ratio at steady state, with burst peaks up to 50:1.
- Short codes are never deleted or recycled - the namespace is write-once, append-only for V1. No reclamation of codes from deleted or expired URLs.
- All submitted URLs are assumed to be valid and reachable - the service does not validate that a URL resolves or is safe before shortening it.
- Clients resolving short codes are standard HTTP clients (browsers, curl, etc.) and correctly follow 301/302 redirects.
- The service is accessible over the public internet - no VPN or private network assumption.
- Write volume is predictable enough that a 7-character base-62 namespace (~3.52 trillion codes) will not be exhausted within the foreseeable operational lifetime of the service.
- There is no existing infrastructure, legacy system, or third-party integration dependency - this is a greenfield build.
- The engineering team is small (2-5 engineers) - the architecture must be operable at that team size.`,
  nfrs: `- Availability: 99.9% uptime SLA, measured monthly. Planned maintenance windows are permitted with advance notice but must not exceed 30 minutes/month.
- Durability: 99.999% data durability for persisted URL mappings - no mapping loss under single-node or single-zone failure.
- Latency: p99 redirect latency < 50ms at peak load. p50 redirect latency < 10ms is a stretch target.
- Throughput: Sustained 10,000 redirects/second read throughput. Sustained 500 writes/second. Burst headroom to 2x steady-state without architectural intervention.
- Scalability: Redirect read capacity must scale horizontally by adding application nodes - no redesign required to scale. Write capacity must scale without full re-architecture, though some operational intervention is acceptable.
- Consistency: Eventual consistency is acceptable for redirect reads - a newly created short code may not be immediately resolvable by all nodes for a brief propagation window (target: < 1 second). Strong consistency is required for the uniqueness guarantee - two concurrent write requests must never produce the same short code.
- Fault tolerance: No single point of failure in the redirect path. Single node or single zone failure must not cause full service outage. The system must self-recover from transient failures without manual intervention.
- Observability: The system must emit latency histograms, error rates, and throughput metrics per endpoint. Structured logs for all requests. Distributed tracing on the redirect path. All metrics accessible via a standard monitoring stack.
- Security: All API endpoints served over HTTPS. No sensitive data (PII, credentials) stored in URL mappings - this is not validated by the service but assumed by design.
- Deployability: Zero-downtime deployments for application tier. Database migrations must be backward-compatible with the running version during rollout.`,
  existing_context:
    "None - this is a fully greenfield system with no legacy infrastructure, no existing tech stack, no pre-existing integrations, and no migration constraints. All architectural decisions are unconstrained by prior choices.",
  locked: false
} as const;

export async function seedPhase1(): Promise<void> {
  console.warn("WARNING: Dev only. Do not run in production.");

  await resetDb();

  await connectNeo4j();

  try {
    await createProblemSpec(problemSpec);

    console.log("Seed complete: unlocked ProblemSpec created.");
  } finally {
    await disconnectNeo4j();
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  seedPhase1().catch((error) => {
    console.error("Failed to seed Phase 1:", error);
    process.exitCode = 1;
  });
}
