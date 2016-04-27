import {db_url as dbURL} from '../config/database.js';
import request from 'shared/JSONRequest.js';
import {generateNamesAndIds, getUpdatedNames, getDeletedProperties} from './utils';
import documents from 'api/documents/documents';
import validateTemplate from 'api/templates/validateTemplate';

let save = (template) => {
  return validateTemplate(template)
  .then(() => request.post(dbURL, template))
  .then((response) => {
    return response.json;
  });
};

let update = (template) => {
  return request.get(`${dbURL}/${template._id}`)
  .then((response) => {
    let currentProperties = response.json.properties;
    let newProperties = template.properties;
    let updatedNames = getUpdatedNames(currentProperties, newProperties);
    let deletedProperties = getDeletedProperties(currentProperties, newProperties);
    return documents.updateMetadataProperties(template._id, updatedNames, deletedProperties);
  })
  .then(() => save(template));
};

export default {
  save(template) {
    template.type = 'template';
    template.properties = template.properties || [];
    template.properties = generateNamesAndIds(template.properties);

    if (template._id) {
      return update(template);
    }

    return save(template);
  },

  delete(template) {
    let url = `${dbURL}/${template._id}?rev=${template._rev}`;

    return documents.countByTemplate(template._id)
    .then((count) => {
      if (count > 0) {
        return Promise.reject({key: 'documents_using_template', value: count});
      }

      return request.delete(url);
    })
    .then((response) => {
      return response.json;
    });
  }
};
