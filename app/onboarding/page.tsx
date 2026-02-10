import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { hasApiKey } from "@/lib/api-keys";
import { OnboardingClient } from "@/components/Onboarding/OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (await hasApiKey(userId)) {
    redirect("/");
  }

  return <OnboardingClient />;
}
