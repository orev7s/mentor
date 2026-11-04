import { useState } from "react";
import type { Mentor } from "@/hooks/use-mentor";

const field =
  "h-11 w-full rounded-chatcn-md border border-chatcn-border bg-chatcn-bg-subtle px-3 " +
  "chatcn-text-14 text-chatcn-fg placeholder:text-chatcn-fg-subtle outline-none transition-colors " +
  "focus:border-chatcn-border-strong focus:shadow-[0_0_0_3px_var(--chatcn-alpha-300)]";

export function ConnectScreen({ mentor }: { mentor: Mentor }) {
  const [url, setUrl] = useState(mentor.url);
  const [token, setToken] = useState(mentor.token);
  const [reveal, setReveal] = useState(false);

  return (
    <div
      className="bg-chatcn-bg text-chatcn-fg flex min-h-dvh flex-col items-center justify-center px-5"
      style={{
        paddingTop: "calc(var(--safe-top) + 2.5rem)",
        paddingBottom: "calc(var(--safe-bottom) + var(--keyboard-overlap, 0px) + 2.5rem)",
        paddingLeft: "calc(var(--safe-left) + 1.25rem)",
        paddingRight: "calc(var(--safe-right) + 1.25rem)",
      }}
    >
      <div className="w-full max-w-[400px]">
        <header className="mb-8">
          <p className="chatcn-text-12 text-chatcn-fg-subtle uppercase tracking-[0.16em]">
            Your study room
          </p>
          <h1 className="chatcn-text-32 text-chatcn-fg mt-2 font-medium tracking-tight">Mentor</h1>
          <p className="chatcn-text-15 text-chatcn-fg-muted mt-2 leading-6 text-pretty">
            Connect to your agent server. It runs on your machine and keeps your notes and files.
          </p>
        </header>

        <form
          className="border-chatcn-border bg-chatcn-bg-subtle rounded-chatcn-xl flex flex-col gap-5 border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void mentor.connect(url, token);
          }}
        >
          <label className="block">
            <span className="chatcn-text-13 text-chatcn-fg font-medium">Server address</span>
            <input
              className={`${field} mt-2 font-mono`}
              data-testid="server-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="http://1.2.3.4:8790"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="url"
            />
          </label>

          <label className="block">
            <span className="chatcn-text-13 text-chatcn-fg font-medium">Access token</span>
            <div className="relative mt-2">
              <input
                className={`${field} pe-16 font-mono`}
                data-testid="server-token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="printed by the server"
                type={reveal ? "text" : "password"}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setReveal((value) => !value)}
                className="chatcn-focus rounded-chatcn-sm chatcn-text-12 text-chatcn-fg-muted hover:text-chatcn-fg absolute end-1.5 top-1/2 flex h-8 -translate-y-1/2 items-center px-2 font-medium transition-colors"
              >
                {reveal ? "Hide" : "Show"}
              </button>
            </div>
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
            className="bg-chatcn-fg text-chatcn-bg rounded-chatcn-md chatcn-text-14 flex h-11 w-full items-center justify-center font-medium transition-opacity disabled:opacity-40"
          >
            {mentor.connecting ? "Connecting..." : "Connect"}
          </button>
        </form>

        <p className="chatcn-text-12 text-chatcn-fg-subtle mt-5 text-pretty leading-5">
          Both are printed when the server starts. They stay on this device.
        </p>
      </div>
    </div>
  );
}