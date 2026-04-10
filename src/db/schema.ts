import { withSession } from "./client.js";

export async function ensureSchema(): Promise<void> {
  await withSession("WRITE", async (session) => {
    await session.run("CREATE CONSTRAINT arch_node_id_unique IF NOT EXISTS FOR (n:ArchNode) REQUIRE n.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT arch_edge_id_unique IF NOT EXISTS FOR (e:ArchEdge) REQUIRE e.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT event_id_unique IF NOT EXISTS FOR (ev:Event) REQUIRE ev.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT problem_spec_id_unique IF NOT EXISTS FOR (p:ProblemSpec) REQUIRE p.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT session_id_unique IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT stack_id_unique IF NOT EXISTS FOR (s:AbstractionStack) REQUIRE s.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT criteria_doc_id_unique IF NOT EXISTS FOR (d:LayerCriteriaDoc) REQUIRE d.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT checklist_draft_id_unique IF NOT EXISTS FOR (d:NodeChecklistDraft) REQUIRE d.id IS UNIQUE");
  });
}
