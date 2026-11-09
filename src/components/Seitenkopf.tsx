import Link from "next/link";
import type { ReactNode } from "react";

export function Seitenkopf({ titel, unterzeile, zurueck, children }: {
  titel: string; unterzeile?: ReactNode; zurueck?: { href: string; text: string }; children?: ReactNode;
}) {
  return (
    <>
      {zurueck && <Link className="zurueck" href={zurueck.href}>← {zurueck.text}</Link>}
      <div className="seitenkopf">
        <div>
          <h1>{titel}</h1>
          {unterzeile && <p className="unterzeile">{unterzeile}</p>}
        </div>
        {children && <div className="knopfleiste" style={{ margin: 0 }}>{children}</div>}
      </div>
    </>
  );
}
