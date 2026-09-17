import fs from 'fs';

let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

const projectModel = `
// -----------------------------------------------------------------------------
// CORE DOMAIN
// -----------------------------------------------------------------------------
model Project {
  id          String   @id @default(uuid())
  key         String   @unique
  name        String
  status      String   @default("ACTIVE") // ACTIVE, ARCHIVED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  userRoles               UserRole[]
  userPermissionOverrides UserPermissionOverride[]
  mediaAssets             MediaAsset[]
  brands                  Brand[]
  pages                   Page[]
  contentReleases         ContentRelease[]
}
`;

schema = schema.replace(
  '// -----------------------------------------------------------------------------',
  projectModel + '\n// -----------------------------------------------------------------------------'
);

schema = schema.replace(
  'projectId String? // Optional scope. If null, applies to SYSTEM/Global.',
  'projectId String? // Optional scope. If null, applies to SYSTEM/Global.\n  project   Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)'
);

schema = schema.replace(
  '  projectId    String?',
  '  projectId    String?\n  project      Project?   @relation(fields: [projectId], references: [id], onDelete: Cascade)'
);

schema = schema.replace(
  '  projectId       String\n  createdAt       DateTime              @default(now())',
  '  projectId       String\n  project         Project               @relation(fields: [projectId], references: [id], onDelete: Restrict)\n  createdAt       DateTime              @default(now())'
);

schema = schema.replace(
  '  projectId       String?\n  name            String',
  '  projectId       String?\n  project         Project? @relation(fields: [projectId], references: [id], onDelete: Restrict)\n  name            String'
);

schema = schema.replace(
  '  projectId           String\n  key                 String',
  '  projectId           String\n  project             Project  @relation(fields: [projectId], references: [id], onDelete: Restrict)\n  key                 String'
);

schema = schema.replace(
  '  projectId    String\n  status       ContentReleaseStatus',
  '  projectId    String\n  project      Project              @relation(fields: [projectId], references: [id], onDelete: Restrict)\n  status       ContentReleaseStatus'
);

fs.writeFileSync('prisma/schema.prisma', schema);
