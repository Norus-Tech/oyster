import { db } from '@oyster/db';

import { isApifyConfigured } from '@/modules/apify';
import { type UpdateCompanyInput } from '@/modules/employment/employment.types';
import {
  fetchCompanyFromLinkedIn,
  getDomainFromCompanyWebsite,
} from '@/modules/employment/use-cases/fetch-company-from-linkedin';
import { fail, success } from '@/shared/utils/core';

export async function updateCompany({
  domain,
  id,
  imageUrl,
  linkedinSlug,
  name,
}: UpdateCompanyInput & { imageUrl?: string }) {
  const company = await db
    .selectFrom('companies')
    .select(['id'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!company) {
    return fail({
      code: 404,
      error: 'Company not found.',
    });
  }

  let syncedImageUrl: string | undefined;
  let description: string | null | undefined;
  let linkedinId: string | undefined;
  let resolvedLinkedInSlug: string | undefined;

  if (linkedinSlug && isApifyConfigured()) {
    try {
      const companyFromLinkedIn = await fetchCompanyFromLinkedIn(linkedinSlug);

      if (!companyFromLinkedIn) {
        return fail({
          code: 404,
          error: 'Company not found on LinkedIn.',
        });
      }

      syncedImageUrl = companyFromLinkedIn.logo;
      description = companyFromLinkedIn.description;
      linkedinId = companyFromLinkedIn.id;
      resolvedLinkedInSlug = companyFromLinkedIn.universalName;
    } catch {
      return fail({
        code: 502,
        error:
          'Failed to sync from LinkedIn. Save your changes without updating the LinkedIn slug, or set APIFY_API_TOKEN.',
      });
    }
  }

  await db
    .updateTable('companies')
    .set({
      description,
      domain,
      linkedinId,
      linkedinSlug: resolvedLinkedInSlug ?? linkedinSlug,
      name,
      ...(syncedImageUrl && { imageUrl: syncedImageUrl }),
      ...(imageUrl && { imageUrl }),
    })
    .where('id', '=', id)
    .execute();

  return success({});
}

export async function syncCompanyFromLinkedIn(id: string) {
  const company = await db
    .selectFrom('companies')
    .select(['id', 'linkedinSlug'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!company) {
    return fail({
      code: 404,
      error: 'Company not found.',
    });
  }

  if (!company.linkedinSlug) {
    return fail({
      code: 400,
      error: 'This company does not have a LinkedIn slug to sync from.',
    });
  }

  const companyFromLinkedIn = await fetchCompanyFromLinkedIn(
    company.linkedinSlug
  );

  if (!companyFromLinkedIn) {
    return fail({
      code: 404,
      error: 'Company not found on LinkedIn.',
    });
  }

  await db
    .updateTable('companies')
    .set({
      description: companyFromLinkedIn.description,
      domain: companyFromLinkedIn.website
        ? getDomainFromCompanyWebsite(companyFromLinkedIn.website)
        : undefined,
      imageUrl: companyFromLinkedIn.logo,
      linkedinId: companyFromLinkedIn.id,
      linkedinSlug: companyFromLinkedIn.universalName,
      name: companyFromLinkedIn.name,
    })
    .where('id', '=', id)
    .execute();

  return success({});
}
