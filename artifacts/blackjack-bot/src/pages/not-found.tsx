import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="py-10">
      <h1 className="text-xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-[13px] text-fg-2">
        That page doesn't exist. <Link href="/" className="underline underline-offset-4 hover:text-fg">Back to Overview</Link>
      </p>
    </div>
  );
}
