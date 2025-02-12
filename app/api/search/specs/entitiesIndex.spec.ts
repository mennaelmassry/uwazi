import db from 'api/utils/testing_db';
import { elasticTesting } from 'api/utils/elastic_testing';
import { errorLog } from 'api/log';
import { UserInContextMockFactory } from 'api/utils/testingUserInContext';
import { UserRole } from 'shared/types/userSchema';
import templates from 'api/templates';
import { TemplateSchema } from 'shared/types/templateType';
import { AccessLevels, PermissionType } from 'shared/types/permissionSchema';
import { search } from '../search';
import { fixtures as fixturesForIndexErrors } from './fixtures_elastic_errors';
import { elastic } from '../elastic';
import { checkMapping, updateMapping, reindexAll } from '../entitiesIndex';
import elasticMapFactory from '../../../../database/elastic_mapping/elasticMapFactory';

const forceIndexingOfNumberBasedProperty = async () => {
  await search.indexEntities({ title: 'Entity with index Problems 1' }, '', 1);
};

describe('entitiesIndex', () => {
  const elasticIndex = 'index_for_entities_index_testing';
  const userFactory = new UserInContextMockFactory();

  beforeEach(async () => {
    await db.clearAllAndLoad({}, elasticIndex);
  });

  afterAll(async () => {
    await db.disconnect();
  });

  describe('indexEntities', () => {
    const loadFailingFixtures = async () => {
      await db.clearAllAndLoad(fixturesForIndexErrors);
      await elasticTesting.resetIndex();
      // force indexing will ensure that all exceptions are mapper_parsing. Otherwise you get different kinds of exceptions
      await forceIndexingOfNumberBasedProperty();
      await elasticTesting.refresh();
    };

    it('indexing without errors', async () => {
      spyOn(errorLog, 'error').and.returnValue('Ok');
      await loadFailingFixtures();
      await search.indexEntities({ title: 'Entity with index Problems 1' }, '', 1);
      expect(errorLog.error).not.toHaveBeenCalled();
      await elasticTesting.refresh();
      const indexedEntities = await search.search({}, 'en');
      expect(indexedEntities.rows.length).toBe(1);
    });
  });

  describe('indexEntities by query', () => {
    it('should only index the entities that match the query', async () => {
      await db.clearAllAndLoad({
        entities: [
          { title: 'title1', language: 'en' },
          { title: 'titulo1', language: 'es' },
          { title: 'title2', language: 'en' },
          { title: 'titulo2', language: 'es' },
          { title: 'title3', language: 'en' },
          { title: 'titulo3', language: 'es' },
          { title: 'title4', language: 'en' },
          { title: 'titulo4', language: 'es' },
          { title: 'title5', language: 'en' },
          {
            title: 'titulo5',
            language: 'es',
            permissions: [{ refId: 'user1', type: PermissionType.USER, level: AccessLevels.WRITE }],
          },
        ],
      });

      await search.indexEntities({ language: 'es' }, '', 2);
      await elasticTesting.refresh();

      const indexedEntities = await elasticTesting.getIndexedEntities();

      expect(indexedEntities).toEqual([
        expect.objectContaining({ title: 'titulo1' }),
        expect.objectContaining({ title: 'titulo2' }),
        expect.objectContaining({ title: 'titulo3' }),
        expect.objectContaining({ title: 'titulo4' }),
        expect.objectContaining({
          title: 'titulo5',
          permissions: [{ refId: 'user1', type: PermissionType.USER, level: AccessLevels.WRITE }],
        }),
      ]);
    });
  });

  describe('updateMapping', () => {
    it('should update the mapping provided by the factory', async () => {
      const template = {
        _id: '123',
        name: 'test',
        properties: [
          { _id: '123', name: 'name', type: 'text' },
          { name: 'dob', type: 'date' },
          { name: 'country', type: 'select' },
        ],
      };
      await updateMapping([template]);
      const mapping = await elastic.indices.getMapping();
      const mappedProps = mapping.body[elasticIndex].mappings.properties.metadata.properties;
      expect(mappedProps.name).toMatchSnapshot();
      expect(mappedProps.dob).toMatchSnapshot();
      expect(mappedProps.country).toMatchSnapshot();
    });
  });

  describe('checkMapping', () => {
    it('should check mapping of a template vs current mapping', async () => {
      const templateA = {
        _id: '123',
        name: 'template A',
        properties: [
          { name: 'name', type: 'text', label: 'Name' },
          { name: 'dob', type: 'date', label: 'Date of birth' },
          { name: 'country', type: 'relationship', label: 'Country' },
        ],
      };

      const templateB = {
        _id: '456',
        name: 'template B',
        properties: [{ name: 'dob', type: 'date', label: 'Date of birth' }],
      };

      await updateMapping([templateA]);
      let response = await checkMapping(templateB);
      expect(response).toEqual({ valid: true });

      templateB.properties = [
        { name: 'dob', type: 'text', label: 'Date of birth' },
        { name: 'country', type: 'select', label: 'Country' },
      ];

      response = await checkMapping(templateB);

      expect(response).toEqual({
        error: 'mapping conflict',
        valid: false,
      });
    });

    it('should check mapping of new added inherited properties', async () => {
      const inheritPropId = db.id();
      const inheritPropNum = db.id();
      const templateA: TemplateSchema = {
        name: 'template A',
        properties: [
          { _id: inheritPropNum, name: 'num', type: 'numeric', label: 'Numeric' },
          { _id: inheritPropId, name: 'name', type: 'text', label: 'Name' },
        ],
        commonProperties: [{ name: 'title', type: 'text', label: 'Name' }],
      };

      await templates.save(templateA, 'en');

      const templateB: TemplateSchema = {
        name: 'template B',
        properties: [
          {
            name: 'relationship',
            label: 'relationship',
            type: 'relationship',
            inherit: { property: inheritPropNum.toString() },
          },
        ],
      };
      await checkMapping(templateB);
      templateB.properties = [
        {
          name: 'relationship',
          label: 'relationship',
          type: 'relationship',
          inherit: { property: inheritPropId.toString() },
        },
      ];
      const response = await checkMapping(templateB);
      expect(response).toEqual({ error: 'mapping conflict', valid: false });
    });

    describe('when the mapping is empty', () => {
      it('should throw no errors', async () => {
        const templateB = {
          _id: '456',
          name: 'template B',
          properties: [{ name: 'dob', type: 'date', label: 'Date of birth' }],
        };
        const response = await checkMapping(templateB);
        expect(response).toEqual({ valid: true });
      });
    });

    describe('when there is an error other than mapping conflict', () => {
      it('should throw the error', async () => {
        spyOn(elasticMapFactory, 'mapping').and.returnValue({ probably_bad_mapping: true });
        await expect(checkMapping({})).rejects.toThrow();
      });
    });
  });

  describe('reindexAll', () => {
    it('should reindex the entities', async () => {
      const entities = [
        { title: 'title1', language: 'en' },
        { title: 'titulo1', language: 'es' },
        { title: 'title2', language: 'en' },
        { title: 'titulo2', language: 'es' },
      ];

      await db.clearAllAndLoad({ entities });
      userFactory.mock({
        _id: 'user1',
        username: 'collaborator',
        role: UserRole.COLLABORATOR,
        email: 'col@test.com',
      });

      await search.indexEntities({});
      await elasticTesting.refresh();

      await reindexAll([], search);
      await elasticTesting.refresh();

      expect(await elasticTesting.getIndexedEntities('')).toEqual([
        expect.objectContaining({ title: 'title1' }),
        expect.objectContaining({ title: 'titulo1' }),
        expect.objectContaining({ title: 'title2' }),
        expect.objectContaining({ title: 'titulo2' }),
      ]);
    });

    it('should delete a field from the mapping', async () => {
      const templateA = {
        _id: '123',
        name: 'template A',
        properties: [
          { name: 'name', type: 'text' },
          { name: 'dob', type: 'date' },
          { name: 'country', type: 'select' },
        ],
      };

      await updateMapping([templateA]);
      templateA.properties = [
        { name: 'name', type: 'text' },
        { name: 'country', type: 'select' },
      ];
      await reindexAll([templateA], search);
      const mapping = await elastic.indices.getMapping();

      expect(
        mapping.body[elasticIndex].mappings.properties.metadata.properties.dob
      ).toBeUndefined();
    });
  });
});
