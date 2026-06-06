import { Link, useNavigate } from "react-router-dom";
import { getCampaigns, getContacts } from "../mock/data";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { CampaignStatusBadge, Pill } from "../components/ui/Badge";
import { ProgressBar } from "../components/ui/ProgressBar";
import type { Campaign } from "../types";

function completionFor(campaign: Campaign): { done: number; total: number } {
  const contacts = getContacts(campaign.id);
  const total = contacts.length || campaign.contact_count;
  const done = contacts.filter(
    (c) =>
      c.status === "completed" ||
      c.status === "failed" ||
      c.status === "exhausted"
  ).length;
  return { done, total };
}

export default function CampaignsList() {
  const campaigns = getCampaigns();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Campaigns
          </h1>
          <p className="mt-1 text-sm text-[#8a8a8a]">
            Outbound AI calling campaigns — upload a list, set a goal, let the
            agents work it.
          </p>
        </div>
        <Button onClick={() => navigate("/new")}>+ New Campaign</Button>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardBody className="py-16 text-center text-[#8a8a8a]">
            No campaigns yet.{" "}
            <Link to="/new" className="text-[#F97316] hover:underline">
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
                      <CampaignStatusBadge status={c.status} />
                    </div>
                  </CardHeader>
                  <CardBody>
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm text-[#8a8a8a]">
                      {c.goal}
                    </p>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-[#8a8a8a]">
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
    </div>
  );
}
