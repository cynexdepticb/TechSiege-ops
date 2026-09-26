import type { Metadata } from "next";
import { requireModule } from "@/lib/guards";
import { canWrite } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { TemplateEditor } from "@/components/comms/template-editor";
import { NewTemplate } from "@/components/comms/new-template";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { COMM_TYPE_LABEL } from "@/lib/authz-lite";
import { TEMPLATE_VARIABLES } from "@/lib/email/templates";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const actor = await requireModule("comms");
  const canEdit = canWrite(actor, "comms");

  const [templates, usage] = await Promise.all([
    prisma.emailTemplate.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.communicationLog.groupBy({
      by: ["templateKey"],
      _count: { _all: true },
      orderBy: { _count: { templateKey: "desc" } },
      take: 10,
    }),
  ]);

  const usedByKey = new Map(usage.map((u) => [u.templateKey, u._count._all]));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Email templates"
        description="Subject and body for every automated email. Variables are replaced per team at send time."
      />

      {canEdit ? (
        <div className="mb-4 flex justify-end">
          <NewTemplate />
        </div>
      ) : null}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Available variables</CardTitle>
          <CardDescription>
            Substitute these in the subject or body; each resolves to that team&apos;s data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TEMPLATE_VARIABLES.map((v) => (
            <code
              key={v.key}
              className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
              title={v.label}
            >
              {`{{${v.key}}}`}
            </code>
          ))}
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <EmptyState
          title="No templates"
          description={
            canEdit
              ? "Create one above, or run npm run db:seed to load the standard event templates."
              : "Run npm run db:seed to load the standard event templates."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{t.name}</CardTitle>
                    <CardDescription>
                      <code className="font-mono text-xs">{t.key}</code>
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline">{COMM_TYPE_LABEL[t.type]}</Badge>
                    {!t.active ? <Badge variant="muted">Inactive</Badge> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Subject
                  </div>
                  <p className="text-sm">{t.subject}</p>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Body
                  </div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
                    {t.body}
                  </pre>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Updated {formatDateTime(t.updatedAt)}</span>
                  <span>
                    {formatNumber(usedByKey.get(t.key) ?? 0)} sends
                  </span>
                </div>
                {canEdit ? (
                  <TemplateEditor
                    template={{
                      id: t.id,
                      key: t.key,
                      name: t.name,
                      type: t.type,
                      subject: t.subject,
                      body: t.body,
                      active: t.active,
                    }}
                  />
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!canEdit ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Read-only — template edits are restricted to the core team.
        </p>
      ) : null}
    </div>
  );
}
