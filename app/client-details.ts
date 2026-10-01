export function optionalText(value: unknown): string {return typeof value === "string" ? value.trim() : "";}
export function clientDetailLines(client: any): string[] {
 return [optionalText(client.address), optionalText(client.contact), optionalText(client.phone), optionalText(client.email), optionalText(client.niu) ? "NIU : " + optionalText(client.niu) : "", optionalText(client.rc) ? "RCCM : " + optionalText(client.rc) : ""].filter(Boolean);
}
