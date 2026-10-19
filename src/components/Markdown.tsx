import Link from "@/components/Link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { wikilinksToMarkdown } from "@/lib/text";

/** Markdown com suporte a [[wikilinks]] no estilo Obsidian. */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a({ href = "", children: label }) {
            if (href.startsWith("/w/")) {
              // prefetch desligado: abrir um [[link]] inexistente cria a nota
              return (
                <Link href={href} prefetch={false} className="wikilink">
                  {label}
                </Link>
              );
            }
            if (href.startsWith("/")) return <Link href={href}>{label}</Link>;
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {label}
              </a>
            );
          },
        }}
      >
        {wikilinksToMarkdown(children)}
      </ReactMarkdown>
    </div>
  );
}
