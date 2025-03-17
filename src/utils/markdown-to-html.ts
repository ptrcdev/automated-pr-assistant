import { marked } from 'marked';

export const markdownToHtml = (markdown: string): string => {
  const htmlContent = marked.parse(markdown);
  return `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
      ${htmlContent}
    </div>
  `;
};
