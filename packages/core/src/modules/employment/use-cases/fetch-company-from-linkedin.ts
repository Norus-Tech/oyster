import { z } from 'zod';

import { withCache } from '@/infrastructure/redis';
import { runActor } from '@/modules/apify';
import { ColorStackError } from '@/shared/errors';

const LinkedInCompany = z.object({
  description: z.string().nullish(),
  id: z.string(),
  logo: z.string().url().optional(),
  name: z.string(),
  universalName: z.string(),
  website: z.string().url().nullish(),
});

export type LinkedInCompany = z.infer<typeof LinkedInCompany>;

export function parseLinkedInCompanySlug(input: string) {
  const trimmed = input.trim();

  const match = trimmed.match(/linkedin\.com\/company\/([^/?#]+)/i);

  if (match?.[1]) {
    return match[1];
  }

  return trimmed.replace(/^@/, '');
}

export async function fetchCompanyFromLinkedIn(
  companyNameOrLinkedInSlug: string
): Promise<LinkedInCompany | null> {
  const linkedInSlug = parseLinkedInCompanySlug(companyNameOrLinkedInSlug);

  const apifyResult = await withCache(
    `harvestapi~linkedin-company:v2:${linkedInSlug}`,
    60 * 60 * 24 * 30,
    async () => {
      return runActor({
        actorId: 'harvestapi~linkedin-company',
        body: {
          companies: [`https://www.linkedin.com/company/${linkedInSlug}`],
        },
      });
    }
  );

  const parseResult = z.array(LinkedInCompany).safeParse(apifyResult);

  if (!parseResult.success) {
    throw new ColorStackError()
      .withMessage('Failed to parse company from LinkedIn.')
      .withContext({ error: JSON.stringify(parseResult.error, null, 2) })
      .report();
  }

  const [companyFromLinkedIn] = parseResult.data;

  return companyFromLinkedIn || null;
}

export function getDomainFromCompanyWebsite(website: string) {
  const hostname = new URL(website).hostname;

  return hostname.split('.').slice(-2).join('.');
}
