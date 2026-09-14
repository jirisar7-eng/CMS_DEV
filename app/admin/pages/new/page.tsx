import React from 'react';
import { PageCreateWorkspace } from '@/components/admin/pages/PageCreateWorkspace';

export const metadata = {
  title: 'Nová stránka | Synthesis CMS',
  description: 'Vytvoření nové stránky v redakčním systému Synthesis.',
};

export default function NewPage() {
  return <PageCreateWorkspace />;
}
