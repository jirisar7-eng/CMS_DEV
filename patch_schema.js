const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

if (!schema.includes('model NavigationSet')) {
  const models = `
enum NavigationContext {
  HEADER
  FOOTER
  MOBILE
  PORTAL
  CUSTOM
}

enum NavigationItemType {
  PAGE
  EXTERNAL_LINK
  ANCHOR
  GROUP
}

enum NavigationSetStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model NavigationSet {
  id          String              @id @default(uuid())
  projectId   String
  project     Project             @relation(fields: [projectId], references: [id], onDelete: Restrict)
  key         String              
  name        String
  context     NavigationContext
  status      NavigationSetStatus @default(DRAFT)
  version     Int                 @default(1)
  description String?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  items       NavigationItem[]

  @@unique([projectId, key])
  @@index([projectId])
}

model NavigationItem {
  id           String             @id @default(uuid())
  setId        String
  set          NavigationSet      @relation(fields: [setId], references: [id], onDelete: Cascade)
  parentId     String?
  parent       NavigationItem?    @relation("ItemHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children     NavigationItem[]   @relation("ItemHierarchy")
  
  type         NavigationItemType
  label        String
  pageId       String?
  page         Page?              @relation(fields: [pageId], references: [id], onDelete: Restrict)
  externalUrl  String?
  anchor       String?
  icon         String?
  visibility   Boolean            @default(true)
  openInNewTab Boolean            @default(false)
  order        Int                @default(0)
  
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  @@index([setId])
  @@index([parentId])
  @@index([pageId])
}
`;
  schema += models;
}

schema = schema.replace(
  /mediaAssets\s+MediaAsset\[\]/,
  'mediaAssets             MediaAsset[]\n  navigationSets          NavigationSet[]'
);

schema = schema.replace(
  /releaseItems\s+ContentReleaseItem\[\]/,
  'releaseItems      ContentReleaseItem[]\n  navigationItems   NavigationItem[]'
);

fs.writeFileSync('prisma/schema.prisma', schema);
