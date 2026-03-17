import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center">
      <h1 className="text-4xl font-bold tracking-tighter sm:text-6xl bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent mb-6">
        FaceSocial
      </h1>
      <p className="max-w-[600px] text-muted-foreground md:text-xl mb-8">
        The social media that respects your face. Upload photos and let us handle the permissions.
      </p>
      <div className="flex gap-4">
        <Link href="/login">
          <Button size="lg">Login</Button>
        </Link>
        <Link href="/register">
          <Button size="lg" variant="outline">Register</Button>
        </Link>
      </div>
    </div>
  );
}
