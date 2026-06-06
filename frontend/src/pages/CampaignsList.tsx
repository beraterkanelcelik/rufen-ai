import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteCampaign, fetchCampaigns } from "../api";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { CampaignStatusBadge, Pill } from "../components/ui/Badge";
import { ProgressBar } from "../components/ui/ProgressBar";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { TrashIcon } from "../components/ui/icons";
import type { Campaign } from "../types";

type Pending =
  | { kind: "one"; campaign: Campaign }
  | { kind: "all"; count: number };

function completionFor(campaign: Campaign): { done: number; total: number } {
  const total = campaign.contact_count;
  const done = campaign.done_count ?? 0;
  return { done, total };
}

export default function CampaignsList() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns()
      .then(setCampaigns)
      .catch((e) => setError(String(e)));
  }, []);

  function askDelete(e: React.MouseEvent, c: Campaign) {
    e.preventDefault(); // don't navigate into the card
    e.stopPropagation();
    setDialogError(null);
    setPending({ kind: "one", campaign: c });
  }

  function askDeleteAll() {
    if (!campaigns || campaigns.length === 0) return;
    setDialogError(null);
    setPending({ kind: "all", count: campaigns.length });
  }

  async function confirmDelete() {
    if (!pending) return;
    setDialogError(null);
    if (pending.kind === "one") {
      const c = pending.campaign;
      setDeleting(c.id);
      try {
        await deleteCampaign(c.id);
        setCampaigns((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
        setPending(null);
      } catch (err) {
        setDialogError(`Could not delete: ${err}`);
      } finally {
        setDeleting(null);
      }
    } else {
      if (!campaigns) return;
      setDeleting("__all__");
      try {
        await Promise.all(campaigns.map((c) => deleteCampaign(c.id)));
        setCampaigns([]);
        setPending(null);
      } catch (err) {
        setDialogError(`Could not delete all: ${err}`);
        fetchCampaigns().then(setCampaigns).catch(() => {});
      } finally {
        setDeleting(null);
      }
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl py-20 text-center text-sm text-red-400">
        Failed to load campaigns: {error}
      </div>
    );
  }
  if (campaigns === null) {
    return (
      <div className="mx-auto max-w-5xl py-20 text-center text-sm text-muted">
        Loading campaigns…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Campaigns
          </h1>
          <p className="mt-1 text-sm text-muted">
            Outbound AI calling campaigns — upload a list, set a goal, let the
            agents work it.
          </p>
        </div>
        {campaigns.length > 0 && (
          <button
            type="button"
            onClick={askDeleteAll}
            disabled={deleting === "__all__"}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm text-muted transition-all duration-200 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            {deleting === "__all__" ? "Deleting…" : "Delete all"}
          </button>
        )}
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardBody className="py-16 text-center text-muted">
            No campaigns yet.{" "}
            <Link to="/new" className="text-primary hover:underline">
              Create your first one
            </Link>
            .
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {campaigns.map((c) => {
            const { done, total } = completionFor(c);
            return (
              <Link key={c.id} to={`/campaign/${c.id}`}>
                <Card hover className="h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-semibold leading-snug text-white">
                        {c.name}
                      </h2>
                      <div className="flex shrink-0 items-center gap-2">
                        <CampaignStatusBadge status={c.status} />
                        <button
                          type="button"
                          aria-label="Delete campaign"
                          title="Delete campaign"
                          disabled={deleting === c.id}
                          onClick={(e) => askDelete(e, c)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-subtle transition-all duration-200 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted">
                      {c.goal}
                    </p>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>
                          {done} / {total} contacts
                        </span>
                        <span className="tabular-nums">
                          {total > 0 ? Math.round((done / total) * 100) : 0}%
                        </span>
                      </div>
                      <ProgressBar value={total > 0 ? done / total : 0} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Pill tone="neutral">
                        {c.concurrency} concurrent
                      </Pill>
                      <Pill tone="neutral">{c.language.toUpperCase()}</Pill>
                      <Pill tone="neutral">
                        {c.max_attempts} attempts
                      </Pill>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        tone="danger"
        title={pending?.kind === "all" ? "Delete all campaigns?" : "Delete campaign?"}
        message={
          pending?.kind === "all" ? (
            <>
              This permanently deletes all{" "}
              <span className="text-foreground">{pending.count}</span> campaigns,
              including their contacts and results. This can't be undone.
            </>
          ) : (
            <>
              This permanently deletes{" "}
              <span className="text-foreground">
                “{pending?.kind === "one" ? pending.campaign.name : ""}”
              </span>{" "}
              along with its contacts and results. This can't be undone.
            </>
          )
        }
        confirmLabel={pending?.kind === "all" ? "Delete all" : "Delete"}
        loading={deleting !== null}
        error={dialogError}
        onConfirm={confirmDelete}
        onCancel={() => {
          setPending(null);
          setDialogError(null);
        }}
      />
    </div>
  );
}
