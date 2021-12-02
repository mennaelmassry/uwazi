/* eslint-disable max-lines */
/* eslint-disable no-param-reassign,max-statements */

import { generateNamesAndIds } from 'api/templates/utils';
import ID from 'shared/uniqueID';
import { propertyTypes } from 'shared/propertyTypes';
import date from 'api/utils/date';
import relationships from 'api/relationships/relationships';
import { search } from 'api/search';
import templates from 'api/templates/templates';
import translationsModel from 'api/i18n/translations';
import path from 'path';
import { PDF, files } from 'api/files';
import * as filesystem from 'api/files';
import dictionariesModel from 'api/thesauri/dictionariesModel';
import translate, { getContext } from 'shared/translate';
import { unique } from 'api/utils/filters';
import { AccessLevels } from 'shared/types/permissionSchema';
import { permissionsContext } from 'api/permissions/permissionsContext';
import { validateEntity } from './validateEntity';
import { deleteFiles, deleteUploadedFiles } from '../files/filesystem';
import model from './entitiesModel';
import settings from '../settings';
import { denormalizeRelated } from './denormalize';
import { saveSelections } from './metadataExtraction/saveSelections';

/** Repopulate metadata object .label from thesauri and relationships. */
async function denormalizeMetadata(metadata, entity, template, dictionariesByKey) {
  if (!metadata) {
    return metadata;
  }

  const translation = (await translationsModel.get({ locale: entity.language }))[0];
  const allTemplates = await templates.get();
  const resolveProp = async (key, value) => {
    if (!Array.isArray(value)) {
      throw new Error('denormalizeMetadata received non-array prop!');
    }
    const prop = template.properties.find(p => p.name === key);
    return Promise.all(
      value.map(async _elem => {
        const elem = { ..._elem };
        if (!elem.hasOwnProperty('value')) {
          throw new Error('denormalizeMetadata received non-value prop!');
        }
        if (!prop) {
          return elem;
        }
        if (prop.content && ['select', 'multiselect'].includes(prop.type)) {
          const dict = dictionariesByKey
            ? dictionariesByKey[prop.content]
            : await dictionariesModel.getById(prop.content);
          if (dict) {
            const context = getContext(translation, prop.content);
            const flattenValues = dict.values.reduce(
              (result, dv) =>
                dv.values
                  ? result.concat(dv.values.map(v => ({ ...v, parent: dv })))
                  : result.concat([dv]),
              []
            );
            const dictElem = flattenValues.find(v => v.id === elem.value);

            if (dictElem && dictElem.label) {
              elem.label = translate(context, dictElem.label, dictElem.label);
            }

            if (dictElem && dictElem.parent) {
              elem.parent = {
                value: dictElem.parent.id,
                label: translate(context, dictElem.parent.label, dictElem.parent.label),
              };
            }
          }
        }

        if (prop.type === 'relationship') {
          const [partner] = await model.getUnrestricted({
            sharedId: elem.value,
            language: entity.language,
          });

          if (partner && partner.title) {
            elem.label = partner.title;
            elem.icon = partner.icon;
            elem.type = partner.file ? 'document' : 'entity';
          }

          if (prop.inherit && prop.inherit.property && partner) {
            const partnerTemplate = allTemplates.find(
              t => t._id.toString() === partner.template.toString()
            );

            const inheritedProperty = partnerTemplate.properties.find(
              p => p._id && p._id.toString() === prop.inherit.property.toString()
            );

            elem.inheritedValue = partner.metadata[inheritedProperty.name] || [];
            elem.inheritedType = inheritedProperty.type;
          }
        }
        return elem;
      })
    );
  };
  if (!template) {
    template = await templates.getById(entity.template);
    if (!template) {
      return metadata;
    }
  }
  return Object.keys(metadata).reduce(
    async (meta, prop) => ({
      ...(await meta),
      [prop]: await resolveProp(prop, metadata[prop]),
    }),
    Promise.resolve({})
  );
}

const FIELD_TYPES_TO_SYNC = [
  propertyTypes.select,
  propertyTypes.multiselect,
  propertyTypes.date,
  propertyTypes.multidate,
  propertyTypes.multidaterange,
  propertyTypes.nested,
  propertyTypes.relationship,
  propertyTypes.relationship,
  propertyTypes.geolocation,
  propertyTypes.numeric,
];

async function updateEntity(entity, _template, unrestricted = false) {
  const docLanguages = await this.getAllLanguages(entity.sharedId);
  if (
    docLanguages[0].template &&
    entity.template &&
    docLanguages[0].template.toString() !== entity.template.toString()
  ) {
    await Promise.all([
      this.deleteRelatedEntityFromMetadata(docLanguages[0]),
      relationships.delete({ entity: entity.sharedId }, null, false),
    ]);
  }
  const template = _template || { properties: [] };
  const toSyncProperties = template.properties
    .filter(p => p.type.match(FIELD_TYPES_TO_SYNC.join('|')))
    .map(p => p.name);
  const currentDoc = docLanguages.find(d => d._id.toString() === entity._id.toString());
  const saveFunc = !unrestricted ? model.save : model.saveUnrestricted;
  return Promise.all(
    docLanguages.map(async d => {
      if (d._id.toString() === entity._id.toString()) {
        const toSave = { ...entity };
        delete toSave.published;
        delete toSave.permissions;

        if (entity.metadata) {
          toSave.metadata = await denormalizeMetadata(entity.metadata, entity, template);
        }

        if (entity.suggestedMetadata) {
          toSave.suggestedMetadata = await denormalizeMetadata(
            entity.suggestedMetadata,
            entity,
            template
          );
        }

        const fullEntity = { ...currentDoc, ...toSave };

        if (template._id) {
          await denormalizeRelated(fullEntity, template, currentDoc);
        }
        return saveFunc(toSave);
      }

      const toSave = { ...d };

      await ['metadata', 'suggestedMetadata'].reduce(async (prev, metadataParent) => {
        await prev;
        if (entity[metadataParent]) {
          toSave[metadataParent] = { ...(toSave[metadataParent] || entity[metadataParent]) };
          toSyncProperties.forEach(p => {
            toSave[metadataParent][p] = entity[metadataParent][p] || [];
          });
          toSave[metadataParent] = await denormalizeMetadata(
            toSave[metadataParent],
            toSave,
            template
          );
        }
      }, Promise.resolve());

      if (typeof entity.template !== 'undefined') {
        toSave.template = entity.template;
      }

      if (typeof entity.generatedToc !== 'undefined') {
        toSave.generatedToc = entity.generatedToc;
      }

      if (template._id) {
        await denormalizeRelated(toSave, template, d);
      }

      return saveFunc(toSave);
    })
  );
}

async function createEntity(doc, languages, sharedId) {
  const template = await templates.getById(doc.template);
  return Promise.all(
    languages.map(async lang => {
      const langDoc = { ...doc };
      const avoidIdDuplication = doc._id && !lang.default;
      if (avoidIdDuplication) {
        delete langDoc._id;
      }
      langDoc.language = lang.key;
      langDoc.sharedId = sharedId;
      langDoc.metadata = await denormalizeMetadata(langDoc.metadata, langDoc, template);

      langDoc.suggestedMetadata = await denormalizeMetadata(
        langDoc.suggestedMetadata,
        langDoc,
        template
      );

      return model.save(langDoc);
    })
  );
}

function getEntityTemplate(doc, language) {
  return new Promise(resolve => {
    if (!doc.sharedId && !doc.template) {
      return resolve(null);
    }

    if (doc.template) {
      return templates.getById(doc.template).then(resolve);
    }

    return this.getById(doc.sharedId, language).then(storedDoc => {
      if (!storedDoc) {
        return null;
      }
      return templates.getById(storedDoc.template).then(resolve);
    });
  });
}

const uniqueMetadataObject = (elem, pos, arr) =>
  elem.value && arr.findIndex(e => e.value === elem.value) === pos;

function sanitize(doc, template) {
  if (!doc.metadata || !template) {
    return doc;
  }

  const metadata = template.properties.reduce((sanitizedMetadata, { type, name }) => {
    if (
      [propertyTypes.multiselect, propertyTypes.relationship].includes(type) &&
      sanitizedMetadata[name]
    ) {
      return Object.assign(sanitizedMetadata, {
        [name]: sanitizedMetadata[name].filter(uniqueMetadataObject),
      });
    }

    if ([propertyTypes.date, propertyTypes.multidate].includes(type) && sanitizedMetadata[name]) {
      return Object.assign(sanitizedMetadata, {
        [name]: sanitizedMetadata[name].filter(value => value.value),
      });
    }

    if (
      [propertyTypes.daterange, propertyTypes.multidaterange].includes(type) &&
      sanitizedMetadata[name]
    ) {
      return Object.assign(sanitizedMetadata, {
        [name]: sanitizedMetadata[name].filter(value => value.value.from || value.value.to),
      });
    }

    if (
      type === propertyTypes.select &&
      (!sanitizedMetadata[name] || !sanitizedMetadata[name][0] || !sanitizedMetadata[name][0].value)
    ) {
      return Object.assign(sanitizedMetadata, { [name]: [] });
    }

    return sanitizedMetadata;
  }, doc.metadata);

  return Object.assign(doc, { metadata });
}

function updateMetadataWithDiff(metadata, diffMetadata) {
  if (!diffMetadata) {
    return metadata;
  }
  const newMetadata = { ...metadata };
  Object.keys(diffMetadata).forEach(p => {
    const dm = diffMetadata[p];
    const toAdd = dm.added || [];
    const toRemove = dm.removed || [];
    if (!dm || toAdd.length + toRemove.length === 0) {
      return;
    }
    if (!newMetadata[p] || !newMetadata[p].length) {
      newMetadata[p] = toAdd;
      return;
    }
    newMetadata[p] = [
      ...newMetadata[p].filter(v => !toRemove.map(vr => vr.value).includes(v.value)),
      ...toAdd.filter(va => !newMetadata[p].map(v => v.value).includes(va.value)),
    ];
  });
  return newMetadata;
}

const validateWritePermissions = (ids, entitiesToUpdate) => {
  const user = permissionsContext.getUserInContext();
  if (!['admin', 'editor'].includes(user.role)) {
    const userIds = user.groups.map(g => g._id.toString());
    userIds.push(user._id.toString());

    const allowedEntitiesToUpdate = entitiesToUpdate.filter(e => {
      const writeGranted = (e.permissions || [])
        .filter(p => p.level === AccessLevels.WRITE)
        .map(p => p.refId)
        .filter(id => userIds.includes(id));
      return writeGranted.length > 0;
    });
    const uniqueIdsLength = allowedEntitiesToUpdate.map(e => e.sharedId).filter(unique).length;
    if (uniqueIdsLength !== ids.length) {
      throw Error('Have not permissions granted to update the requested entities');
    }
  }
};

const withDocuments = async (entities, documentsFullText) => {
  const sharedIds = entities.map(entity => entity.sharedId);
  const allFiles = await files.get(
    { entity: { $in: sharedIds } },
    documentsFullText ? '+fullText ' : ' '
  );
  const idFileMap = new Map();
  allFiles.forEach(file => {
    if (idFileMap.has(file.entity)) {
      idFileMap.get(file.entity).push(file);
    } else {
      idFileMap.set(file.entity, [file]);
    }
  });
  const result = entities.map(entity => {
    // intentionally passing copies
    // consumers of the result do not handle it immutably (sometimes even delete data)
    // changes result in possibly breaking side-effects when file objects are shared between entities
    const entityFiles = idFileMap.has(entity.sharedId)
      ? idFileMap.get(entity.sharedId).map(file => ({ ...file }))
      : [];
    entity.documents = entityFiles.filter(f => f.type === 'document');
    entity.attachments = entityFiles.filter(f => f.type === 'attachment');
    return entity;
  });
  return result;
};

const reindexEntitiesByTemplate = async (template, options) => {
  const templateHasRelationShipProperty = template.properties?.find(
    p => p.type === propertyTypes.relationship
  );
  if (options.reindex && (options.generatedIdAdded || !templateHasRelationShipProperty)) {
    return search.indexEntities({ template: template._id });
  }
  return Promise.resolve();
};

const extendSelect = select => {
  if (!select) {
    return select;
  }
  if (typeof select === 'string') {
    return select.includes('+') ? `${select} +sharedId` : `${select} sharedId`;
  }
  if (Array.isArray(select)) {
    return select.concat(['sharedId']);
  }
  return Object.keys(select).length > 0 ? { sharedId: 1, ...select } : select;
};

export default {
  denormalizeMetadata,
  sanitize,
  updateEntity,
  createEntity,
  getEntityTemplate,
  async save(_doc, { user, language }, options = {}) {
    const { updateRelationships = true, index = true, includeDocuments = true } = options;
    await validateEntity(_doc);
    await saveSelections(_doc);
    const doc = _doc;

    if (!doc.sharedId) {
      doc.user = user._id;
      doc.creationDate = date.currentUTC();
      doc.published = false;
    }
    const sharedId = doc.sharedId || ID();
    const template = await this.getEntityTemplate(doc, language);
    let docTemplate = template;
    doc.editDate = date.currentUTC();

    if (doc.sharedId) {
      await this.updateEntity(this.sanitize(doc, template), template);
    } else {
      const [{ languages }, [defaultTemplate]] = await Promise.all([
        settings.get(),
        templates.get({ default: true }),
      ]);

      if (!doc.template) {
        doc.template = defaultTemplate._id;
        docTemplate = defaultTemplate;
      }
      doc.metadata = doc.metadata || {};
      await this.createEntity(this.sanitize(doc, docTemplate), languages, sharedId);
    }

    const [entity] = includeDocuments
      ? await this.getUnrestrictedWithDocuments({ sharedId, language }, '+permissions')
      : await this.getUnrestricted({ sharedId, language }, '+permissions');

    if (updateRelationships) {
      await relationships.saveEntityBasedReferences(entity, language);
    }

    if (index) {
      await search.indexEntities({ sharedId }, '+fullText');
    }

    return entity;
  },

  async denormalize(_doc, { user, language }) {
    await validateEntity(_doc);
    const doc = _doc;
    if (!doc.sharedId) {
      doc.user = user._id;
      doc.creationDate = date.currentUTC();
      doc.published = false;
    }

    doc.sharedId = doc.sharedId || ID();
    const [template, [defaultTemplate]] = await Promise.all([
      this.getEntityTemplate(doc, language),
      templates.get({ default: true }),
    ]);
    let docTemplate = template;
    if (!doc.template) {
      doc.template = defaultTemplate._id;
      doc.metadata = {};
      docTemplate = defaultTemplate;
    }
    const entity = this.sanitize(doc, docTemplate);
    entity.metadata = await denormalizeMetadata(entity.metadata, entity, docTemplate);
    entity.suggestedMetadata = await denormalizeMetadata(
      entity.suggestedMetadata,
      entity,
      docTemplate
    );
    return entity;
  },

  /** Bulk rebuild relationship-based metadata objects as {value = id, label: title}. */
  async bulkUpdateMetadataFromRelationships(query, language, limit = 200, reindex = true) {
    const process = async (offset, totalRows) => {
      if (offset >= totalRows) {
        return;
      }

      const entities = await this.get(query, 'sharedId', { skip: offset, limit });
      await this.updateMetdataFromRelationships(
        entities.map(entity => entity.sharedId),
        language,
        reindex
      );
      await process(offset + limit, totalRows);
    };
    const totalRows = await this.count(query);
    await process(0, totalRows);
  },

  async getWithoutDocuments(query, select, options = {}) {
    return model.getUnrestricted(query, select, options);
  },

  async getUnrestricted(query, select, options) {
    const extendedSelect = extendSelect(select);
    return model.getUnrestricted(query, extendedSelect, options);
  },

  async getUnrestrictedWithDocuments(query, select, options = {}) {
    const { documentsFullText, ...restOfOptions } = options;
    const entities = await this.getUnrestricted(query, select, restOfOptions);
    return withDocuments(entities, documentsFullText);
  },

  async get(query, select, options = {}) {
    const { withoutDocuments, documentsFullText, ...restOfOptions } = options;
    const extendedSelect = withoutDocuments ? select : extendSelect(select);
    const entities = await model.get(query, extendedSelect, restOfOptions);
    return withoutDocuments ? entities : withDocuments(entities, documentsFullText);
  },

  async getWithRelationships(query, select, pagination) {
    const entities = await this.get(query, select, pagination);
    return Promise.all(
      entities.map(async entity => {
        entity.relations = await relationships.getByDocument(entity.sharedId, entity.language);
        return entity;
      })
    );
  },

  async getById(sharedId, language) {
    let doc;
    if (!language) {
      doc = await model.getById(sharedId);
    } else {
      doc = await model.get({ sharedId, language }).then(result => result[0]);
    }
    return doc;
  },

  async saveMultiple(docs) {
    await docs.reduce(async (prev, doc) => {
      await prev;
      await validateEntity(doc);
    }, Promise.resolve());

    const response = await model.saveMultiple(docs);
    await search.indexEntities({ _id: { $in: response.map(d => d._id) } }, '+fullText');
    return response;
  },

  async multipleUpdate(ids, values, params) {
    const { diffMetadata = {}, ...pureValues } = values;

    const entitiesToUpdate = await this.getUnrestricted({ sharedId: { $in: ids } }, '+permissions');
    validateWritePermissions(ids, entitiesToUpdate);
    await Promise.all(
      ids.map(async id => {
        const entity = await entitiesToUpdate.find(
          e => e.sharedId === id && e.language === params.language
        );

        if (entity) {
          await this.save(
            {
              ...entity,
              ...pureValues,
              metadata: updateMetadataWithDiff(
                { ...entity.metadata, ...pureValues.metadata },
                diffMetadata
              ),
              permissions: entity.permissions || [],
            },
            params,
            true,
            false
          );
        }
      })
    );

    await search.indexEntities({ sharedId: { $in: ids } });
    return this.get({ sharedId: { $in: ids }, language: params.language });
  },

  getAllLanguages(sharedId) {
    return model.get({ sharedId });
  },

  countByTemplate(template, language) {
    const query = language ? { template, language } : { template };
    return model.count(query);
  },

  getByTemplate(template, language, onlyPublished = true, limit) {
    const query = {
      template,
      language,
      ...(onlyPublished ? { published: true } : {}),
    };
    const queryLimit = limit ? { limit } : {};
    return model.get(query, ['title', 'icon', 'file', 'sharedId'], queryLimit);
  },

  /** Rebuild relationship-based metadata objects as {value = id, label: title}. */
  async updateMetdataFromRelationships(entities, language, reindex = true) {
    const entitiesToReindex = [];
    const _templates = await templates.get();
    await Promise.all(
      entities.map(async entityId => {
        const entity = await this.getById(entityId, language);
        const relations = await relationships.getByDocument(entityId, language);

        if (entity && entity.template) {
          entity.metadata = entity.metadata || {};
          const template = _templates.find(t => t._id.toString() === entity.template.toString());

          const relationshipProperties = template.properties.filter(p => p.type === 'relationship');
          relationshipProperties.forEach(property => {
            const relationshipsGoingToThisProperty = relations.filter(
              r =>
                r.template &&
                r.template.toString() === property.relationType.toString() &&
                (!property.content || r.entityData.template.toString() === property.content)
            );

            entity.metadata[property.name] = relationshipsGoingToThisProperty.map(r => ({
              value: r.entity,
              label: r.entityData.title,
            }));
          });
          if (relationshipProperties.length) {
            entitiesToReindex.push(entity.sharedId);
            await this.updateEntity(this.sanitize(entity, template), template, true);
          }
        }
      })
    );

    if (reindex) {
      await search.indexEntities({ sharedId: { $in: entitiesToReindex } });
    }
  },

  /** Handle property deletion and renames. */
  async updateMetadataProperties(
    template,
    currentTemplate,
    language,
    options = { reindex: true, generatedIdAdded: false }
  ) {
    const actions = { $rename: {}, $unset: {} };
    template.properties = await generateNamesAndIds(template.properties);
    template.properties.forEach(property => {
      const currentProperty = currentTemplate.properties.find(p => p.id === property.id);
      if (currentProperty && currentProperty.name !== property.name) {
        actions.$rename[`metadata.${currentProperty.name}`] = `metadata.${property.name}`;
      }
    });
    currentTemplate.properties.forEach(property => {
      if (!template.properties.find(p => p.id === property.id)) {
        actions.$unset[`metadata.${property.name}`] = '';
      }
    });

    const noneToUnset = !Object.keys(actions.$unset).length;
    const noneToRename = !Object.keys(actions.$rename).length;

    if (noneToUnset) {
      delete actions.$unset;
    }
    if (noneToRename) {
      delete actions.$rename;
    }

    if (actions.$unset || actions.$rename) {
      await model.updateMany({ template: template._id }, actions);
    }
    await reindexEntitiesByTemplate(template, options);
    return this.bulkUpdateMetadataFromRelationships(
      { template: template._id, language },
      language,
      200,
      options.reindex
    );
  },

  async deleteFiles(deletedDocs) {
    await files.delete({ entity: { $in: deletedDocs.map(d => d.sharedId) } });
    const attachmentsToDelete = deletedDocs.reduce((filePaths, doc) => {
      if (doc.attachments) {
        doc.attachments.forEach(file =>
          filePaths.push({ filename: path.normalize(`${file.filename}`) })
        );
      }
      return filePaths;
    }, []);
    return deleteUploadedFiles(attachmentsToDelete);
  },

  deleteIndexes(sharedIds) {
    const deleteIndexBatch = (offset, totalRows) => {
      const limit = 200;
      if (offset >= totalRows) {
        return Promise.resolve();
      }
      return this.get({ sharedId: { $in: sharedIds } }, null, { skip: offset, limit })
        .then(entities => search.bulkDelete(entities))
        .then(() => deleteIndexBatch(offset + limit, totalRows));
    };

    return this.count({ sharedId: { $in: sharedIds } }).then(totalRows =>
      deleteIndexBatch(0, totalRows)
    );
  },

  deleteMultiple(sharedIds) {
    return this.deleteIndexes(sharedIds).then(() =>
      sharedIds.reduce(
        (previousPromise, sharedId) => previousPromise.then(() => this.delete(sharedId, false)),
        Promise.resolve()
      )
    );
  },

  async delete(sharedId, deleteIndex = true) {
    const docs = await this.get({ sharedId });
    if (!docs.length) {
      return docs;
    }
    if (deleteIndex) {
      await Promise.all(docs.map(doc => search.delete(doc)));
    }
    try {
      await model.delete({ sharedId });
    } catch (e) {
      await search.indexEntities({ sharedId }, '+fullText');
      throw e;
    }
    await Promise.all([
      relationships.delete({ entity: sharedId }, null, false),
      files.delete({ entity: sharedId }),
      this.deleteFiles(docs),
      this.deleteRelatedEntityFromMetadata(docs[0]),
    ]);
    return docs;
  },

  async removeValuesFromEntities(properties, template) {
    const query = { template, $or: [] };
    const changes = {};

    properties.forEach(prop => {
      const propQuery = {};
      propQuery[`metadata.${prop}`] = { $exists: true };
      query.$or.push(propQuery);
      changes[`metadata.${prop}`] = [];
    });

    const entitiesToReindex = await this.get(query, { _id: 1 });
    await model.updateMany(query, { $set: changes });
    return search.indexEntities({ _id: { $in: entitiesToReindex.map(e => e._id.toString()) } });
  },

  /** Propagate the deletion metadata.value id to all entity metadata. */
  async deleteFromMetadata(deletedId, propertyContent, propTypes) {
    const allTemplates = await templates.get({ 'properties.content': propertyContent });
    const allProperties = allTemplates.reduce((m, t) => m.concat(t.properties), []);
    const properties = allProperties.filter(p => propTypes.includes(p.type));
    const query = { $or: [] };
    const changes = {};
    query.$or = properties
      .filter(
        p => propertyContent && p.content && propertyContent.toString() === p.content.toString()
      )
      .map(property => {
        const p = {};
        p[`metadata.${property.name}.value`] = deletedId;
        changes[`metadata.${property.name}`] = { value: deletedId };
        return p;
      });
    if (!query.$or.length) {
      return;
    }
    const entities = await this.get(query, { _id: 1 });
    await model.updateMany(query, { $pull: changes });
    if (entities.length > 0) {
      await search.indexEntities({ _id: { $in: entities.map(e => e._id.toString()) } }, null, 1000);
    }
  },

  /** Propagate the deletion of a thesaurus entry to all entity metadata. */
  async deleteThesaurusFromMetadata(deletedId, thesaurusId) {
    await this.deleteFromMetadata(deletedId, thesaurusId, [
      propertyTypes.select,
      propertyTypes.multiselect,
    ]);
  },

  /** Propagate the deletion of a related entity to all entity metadata. */
  async deleteRelatedEntityFromMetadata(deletedEntity) {
    await this.deleteFromMetadata(deletedEntity.sharedId, deletedEntity.template, [
      propertyTypes.select,
      propertyTypes.multiselect,
      propertyTypes.relationship,
    ]);
  },

  async createThumbnail(entity) {
    const filePath = filesystem.uploadsPath(entity.file.filename);
    return new PDF({ filename: filePath }).createThumbnail(entity._id.toString());
  },

  async deleteLanguageFiles(entity) {
    const filesToDelete = [];
    filesToDelete.push(path.normalize(filesystem.uploadsPath(`${entity._id.toString()}.jpg`)));
    const sibilings = await this.get({ sharedId: entity.sharedId, _id: { $ne: entity._id } });
    if (entity.file) {
      const shouldUnlinkFile = sibilings.reduce(
        (should, sibiling) => should && !(sibiling.file.filename === entity.file.filename),
        true
      );
      if (shouldUnlinkFile) {
        filesToDelete.push(path.normalize(filesystem.uploadsPath(entity.file.filename)));
      }
    }
    if (entity.file) {
      await deleteFiles(filesToDelete);
    }
  },

  async generateNewEntitiesForLanguage(entities, language) {
    return Promise.all(
      entities.map(async _entity => {
        const { __v, _id, ...entity } = _entity;
        entity.language = language;
        entity.metadata = await this.denormalizeMetadata(entity.metadata, entity);
        entity.suggestedMetadata = await this.denormalizeMetadata(entity.suggestedMetadata, entity);
        return entity;
      })
    );
  },

  async addLanguage(language, limit = 50) {
    const [languageTranslationAlreadyExists] = await this.getUnrestrictedWithDocuments(
      { locale: language },
      null,
      {
        limit: 1,
      }
    );
    if (languageTranslationAlreadyExists) {
      return;
    }

    const { languages } = await settings.get();

    const defaultLanguage = languages.find(l => l.default).key;
    const duplicate = async (offset, totalRows) => {
      if (offset >= totalRows) {
        return;
      }

      const entities = await this.getUnrestrictedWithDocuments(
        { language: defaultLanguage },
        '+permissions',
        {
          skip: offset,
          limit,
        }
      );
      const newLanguageEntities = await this.generateNewEntitiesForLanguage(entities, language);
      const newSavedEntities = await this.saveMultiple(newLanguageEntities);
      await newSavedEntities.reduce(async (previous, entity) => {
        await previous;
        if (entity.file) {
          return this.createThumbnail(entity);
        }
        return Promise.resolve();
      }, Promise.resolve());
      await duplicate(offset + limit, totalRows);
    };

    const totalRows = await this.count({ language: defaultLanguage });
    await duplicate(0, totalRows);
  },

  async removeLanguage(locale) {
    const deleteFilesByLanguage = (offset, totalRows) => {
      const limit = 200;
      if (offset >= totalRows) {
        return Promise.resolve();
      }

      return this.get({ language: locale }, null, { skip: offset, limit })
        .then(entities => Promise.all(entities.map(entity => this.deleteLanguageFiles(entity))))
        .then(() => deleteFilesByLanguage(offset + limit, totalRows));
    };

    return this.count({ language: locale })
      .then(totalRows => deleteFilesByLanguage(0, totalRows))
      .then(() => model.delete({ language: locale }))
      .then(() => search.deleteLanguage(locale));
  },

  count: model.count.bind(model),
};
