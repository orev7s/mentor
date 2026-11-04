import { useState } from "react";
import type { Mentor } from "@/hooks/use-mentor";

const field =
  "mt-1.5 h-10 w-full rounded-chatcn-md border border-chatcn-border bg-chatcn-bg-subtle px-3 " +
  "chatcn-text-14 text-chatcn-fg placeholder:text-chatcn-fg-subtle outline-none " +
  "focus:border-chatcn-border-strong focus:shadow-[0_0_0_3px_var(--chatcn-alpha-300)]";

export function ConnectScreen({ mentor }: { mentor: Mentor }) {
  const [url, setUrl] = useState(mentor.url);
  const [token, setToken] = useState(mentor.token);

  return (
    <div className="bg-chatcn-bg text-chatcn-fg flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <div className="bg-chatcn-fg text-chatcn-bg mb-5 grid size-10 place-items-center rounded-chatcn-lg chatcn-text-16 font-semibold">
            M
          </div>
          <h1 className="chatcn-text-24 text-chatcn-fg font-medium tracking-tight">Mentor</h1>
          <p className="chatcn-text-14 text-chatcn-fg-muted mt-1.5 text-pretty">
            Connect to your agent server. It runs on your machine and keeps your notes and files.
          </p>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void mentor.connect(url, token);
          }}
        >
          <label className="block">
            <span className="chatcn-text-12 text-chatcn-fg-subtle font-medium uppercase tracking-[0.08em]">
              Server address
            </span>
            <input
              className={field}
              data-testid="server-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="http://1.2.3.4:8790"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="block">
            <span className="chatcn-text-12 text-chatcn-fg-subtle font-medium uppercase tracking-[0.08em]">
              Access token
            </span>
            <input
              className={field}
              data-testid="server-token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="token printed by the server"
              type="password"
            />
          </label>

          {mentor.error ? (
            <p className="chatcn-text-13 text-chatcn-red text-pretty" role="alert">
              {mentor.error}
            </p>
          ) : null}

          <button
            type="submit"
            data-testid="connect-button"
            disabled={mentor.connecting || !url || !token}
            className="bg-chatcn-fg text-chatcn-bg rounded-chatcn-md chatcn-text-14 mt-1 flex h-10 w-full items-center justify-center font-medium transition-opacity disabled:opacity-40"
          >
            {mentor.connecting ? "Connecting..." : "Connect"}
          </button>
        </form>

        <p className="chatcn-text-12 text-chatcn-fg-subtle mt-5 leading-relaxed">
          The address and token are printed when the server starts. They are stored on this device.
        </p>
      </div>
    </div>
  );
}