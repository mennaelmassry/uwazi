import { ObjectId } from 'mongodb';
import db from 'api/utils/testing_db';
import { EntitySchema } from 'shared/types/entityType';
import { FileType } from 'shared/types/fileType';
import {
  PropertySchema,
  MetadataSchema,
  PropertyValueSchema,
  MetadataObjectSchema,
} from 'shared/types/commonTypes';

export function getIdMapper() {
  const map = new Map<string, ObjectId>();

  return function setAndGet(key: string) {
    if (!map.has(key)) map.set(key, db.id() as ObjectId);

    return map.get(key)!;
  };
}

export function getFixturesFactory() {
  const idMapper = getIdMapper();

  return Object.freeze({
    id: idMapper,

    template: (name: string, properties: PropertySchema[] = []) => ({
      _id: idMapper(name),
      name,
      properties,
    }),

    entity: (
      id: string,
      template?: string,
      metadata: MetadataSchema = {},
      props: EntitySchema = { language: 'en' }
    ): EntitySchema => {
      const language = props.language || 'en';
      return {
        _id: idMapper(`${id}-${language}`),
        sharedId: id,
        title: `${id}`,
        ...(template ? { template: idMapper(template) } : {}),
        metadata,
        language,
        ...props,
      };
    },

    file: (
      id: string,
      entity: string,
      type: 'custom' | 'document' | 'thumbnail' | 'attachment' | undefined,
      filename: string,
      language: string = 'en'
    ): FileType => ({
      _id: idMapper(`${id}`),
      entity,
      language,
      type,
      filename,
    }),

    inherit(name: string, content: string, property: string, props = {}): PropertySchema {
      return this.relationshipProp(name, content, {
        inherit: { property: idMapper(property).toString() },
        ...props,
      });
    },

    relationshipProp(name: string, content: string, props = {}): PropertySchema {
      return this.property(name, 'relationship', {
        relationType: idMapper('rel1').toString(),
        content: idMapper(content).toString(),
        ...props,
      });
    },

    property: (
      name: string,
      type: PropertySchema['type'] = 'text',
      props = {}
    ): PropertySchema => ({
      _id: idMapper(name),
      id: name,
      label: name,
      name,
      type,
      ...props,
    }),

    metadataValue: (value: PropertyValueSchema) => ({ value }),

    thesauri: (name: string, values: Array<string | [string, string]>) => ({
      name,
      _id: idMapper(name),
      values: values.map(value =>
        typeof value === 'string'
          ? { _id: idMapper(value), id: value, label: value }
          : { _id: idMapper(value[0]), id: value[0], label: value[1] }
      ),
    }),
  });
}
