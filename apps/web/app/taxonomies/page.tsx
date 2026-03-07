import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderTree, Smartphone, CheckCircle2, Bug } from "lucide-react";

const types = [
  {
    href: "/taxonomies/business-category",
    label: "Business category",
    description: "L1/L2/L3 and node hierarchy for business categories.",
    icon: FolderTree,
  },
  {
    href: "/taxonomies/application",
    label: "Application",
    description: "Applications and products (vendor, product name, keywords).",
    icon: Smartphone,
  },
  {
    href: "/taxonomies/resolution",
    label: "Resolution",
    description: "Resolution outcomes, action types, and codes.",
    icon: CheckCircle2,
  },
  {
    href: "/taxonomies/root-cause",
    label: "Root cause",
    description: "Cause domains, types, and root cause codes.",
    icon: Bug,
  },
];

export default function TaxonomiesPage() {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        View and browse taxonomy reference data used for ticket classification.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {types.map(({ href, label, description, icon: Icon }) => (
          <Card key={href}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">{label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{description}</p>
              <Button asChild variant="secondary" size="sm">
                <Link href={href}>View table</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
