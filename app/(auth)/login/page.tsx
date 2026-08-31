import Link from "next/link";
import { GraduationCap, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { DevLoginForm } from "@/components/auth/dev-login-form";
import { isDevLoginEnabled } from "@/lib/dev-login";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <Card className="w-full shadow-xl">
      <CardHeader className="items-center gap-2 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <GraduationCap className="size-7" />
        </div>
        <CardTitle className="text-xl">PTA Collection System</CardTitle>
        <CardDescription className="text-pretty">
          Sign in with the Google account your school administrator invited.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GoogleSignInButton next={next} />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Access is by invitation only. There are no passwords.
        </p>
        {isDevLoginEnabled() && <DevLoginForm />}

        {/* This page is staff-only: Google, by invitation. A parent who
            followed "Sign in" from the site lands here holding a card and no
            invitation, so give them the door rather than a dead end. */}
        <div className="mt-6 border-t pt-5 text-center">
          <p className="text-xs text-muted-foreground">
            Parent or guardian?
          </p>
          <Button asChild variant="outline" size="sm" className="mt-2 w-full">
            <Link href="/portal/login">
              <IdCard className="size-4" />
              Sign in with your parent card
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
