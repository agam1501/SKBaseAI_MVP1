import { redirect } from "next/navigation";

export default function UploadTicketsRedirect() {
  redirect("/ingestion");
}
