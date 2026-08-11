# Newsletter Campaign Automation

This folder stores generated campaign assets for the bi-weekly GoCloud newsletter.

## Workflow

1. Update the content calendar in data/newsletter/calendar.json.
2. Run the generator:
   - npm run generate:newsletter
3. Review the generated payload in docs/newsletter-campaign/campaign-plan.json.
4. Use the generated subjects, previews, and CTA links to prepare the final email.

## Notes

- The generator reads blog posts from data/posts/ and maps each campaign entry to the corresponding article.
- If a post is missing, the generator still produces a draft entry so the process does not stop.
