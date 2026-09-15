#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0e5607ab9ac9cba1010374a4dd0d8ec3fa25537bbefca8774e03fe1d18d0cebd/contract';
import endContract from '../../snapshots/0e5607ab9ac9cba1010374a4dd0d8ec3fa25537bbefca8774e03fe1d18d0cebd/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'mediaAsset',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('dimensions', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('filename', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('mediaType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('mimeType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('projectId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('security', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('sizeBytes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('storageKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usageCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mediaAssetVersion',
        columns: [
          col('assetId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('mimeType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('originalFilename', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('security', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('sizeBytes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('storageKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('versionNumber', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mediaUsageReference',
        columns: [
          col('assetId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('blockId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('blockType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('field', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('pageId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('pageSlug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('pageTitle', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'mediaAsset',
        constraint: 'mediaAsset_storageKey_key',
        columns: ['storageKey'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'mediaAssetVersion',
        constraint: 'mediaAssetVersion_assetId_versionNumber_key',
        columns: ['assetId', 'versionNumber'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mediaAsset',
        index: 'mediaAsset_projectId_idx_a96e4d92',
        columns: ['projectId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mediaAsset',
        index: 'mediaAsset_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mediaAssetVersion',
        index: 'mediaAssetVersion_assetId_idx_4ebe630a',
        columns: ['assetId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'mediaUsageReference',
        index: 'mediaUsageReference_assetId_idx_4ebe630a',
        columns: ['assetId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mediaAssetVersion',
        foreignKey: {
          name: 'mediaAssetVersion_assetId_fkey',
          columns: ['assetId'],
          references: { schema: 'public', table: 'mediaAsset', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mediaUsageReference',
        foreignKey: {
          name: 'mediaUsageReference_assetId_fkey',
          columns: ['assetId'],
          references: { schema: 'public', table: 'mediaAsset', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
