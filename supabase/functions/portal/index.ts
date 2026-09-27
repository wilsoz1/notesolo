// portal: the borrower's door into their own relationship.
// GET  ?token=…                 → validates the portal (exists, not revoked/expired, passcode),
//                                 logs the access, returns open requests + received history.
// POST ?token=…&request_id=…    → multipart file upload against one open request: stores the
//                                 file in the org's bucket path, creates the documents row
//                                 (needs_review), marks the request received, and closes the
//                                 tickler it came from.
// Deployed with --no-verify-jwt: borrowers have no account; the capability is the unguessable
// 48-hex token plus expiry, revocation and optional passcode — the share-room model, two-way.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_BYTES = 25 * 1024 * 1024;
const OK_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/tiff"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return json({ error: "invalid link" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: portal } = await admin
    .from("borrower_portals")
    .select("*, customers(name, company), orgs(name)")
    .eq("token", token)
    .single();
  if (!portal) return json({ error: "This link is invalid." }, 404);
  if (portal.revoked) return json({ error: "This portal has been closed by the lender." }, 410);
  if (new Date(portal.expires_at) < new Date()) return json({ error: "This link has expired — ask your lender for a fresh one." }, 410);
  if (portal.passcode) {
    const supplied = url.searchParams.get("passcode") ?? "";
    if (supplied !== portal.passcode) return json({ needs_passcode: true, error: supplied ? "Incorrect passcode." : "This portal requires a passcode." }, 401);
  }

  if (req.method === "POST") {
    const requestId = url.searchParams.get("request_id") ?? "";
    const { data: dr } = await admin.from("doc_requests").select("*").eq("id", requestId).single();
    if (!dr || dr.customer_id !== portal.customer_id) return json({ error: "unknown request" }, 404);
    if (dr.status !== "open") return json({ error: "This request has already been fulfilled." }, 409);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "no file" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "File is over 25MB — split it or ask your lender." }, 413);
    if (!OK_TYPES.includes(file.type)) return json({ error: "PDF or scanned images only." }, 415);

    const safeName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "upload.pdf";
    const path = `${portal.org_id}/portal/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await admin.storage.from("documents")
      .upload(path, file, { contentType: file.type });
    if (upErr) return json({ error: "Upload failed — try again." }, 502);

    const { data: doc } = await admin.from("documents").insert({
      org_id: portal.org_id, customer_id: portal.customer_id, loan_id: dr.loan_id,
      filename: safeName, storage_path: path, doc_type: "Unclassified",
      confidence: 0, status: "needs_review",
    }).select().single();

    await admin.from("doc_requests").update({
      status: "received", document_id: doc?.id ?? null, received_at: new Date().toISOString(),
    }).eq("id", dr.id);
    if (dr.tickler_id) {
      await admin.from("ticklers").update({ status: "complete" }).eq("id", dr.tickler_id);
    }
    return json({ ok: true });
  }

  await admin.from("borrower_portals")
    .update({ access_count: portal.access_count + 1, last_accessed_at: new Date().toISOString() })
    .eq("id", portal.id);

  const { data: requests } = await admin
    .from("doc_requests")
    .select("id, title, note, status, created_at, received_at, loans(loan_number)")
    .eq("customer_id", portal.customer_id)
    .order("created_at", { ascending: false });

  return json({
    lender: portal.orgs?.name,
    borrower: portal.customers?.company ?? portal.customers?.name,
    expires_at: portal.expires_at,
    requests: requests ?? [],
  });
});
