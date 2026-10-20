export type PublicDirectoryEntry={id:string;label:string;kind:string;description:string;items:{title:string;description:string}[]};
export type PublicSearchMatch={id:string;section:string;title:string;excerpt:string};
export function buildPublishedDirectory(sections:unknown):PublicDirectoryEntry[];
export function searchPublishedDirectory(entries:PublicDirectoryEntry[],query:string):PublicSearchMatch[];
