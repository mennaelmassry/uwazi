import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { actions } from 'app/BasicReducer';
import SearchButton from 'app/Entities/components/SearchButton';
import relationTypesAPI from 'app/RelationTypes/RelationTypesAPI';
import * as relationships from 'app/Relationships/utils/routeUtils';

import { getPageAssets } from 'app/Pages/utils/getPageAssets';
import { formater as formatter } from 'app/Metadata';

import EntityViewer from '../Entities/components/EntityViewer';
import entitiesAPI from '../Entities/EntitiesAPI';
import * as uiActions from '../Entities/actions/uiActions';

const formatEntity = (entity, templates, thesauris) => {
  const formattedEntity = formatter.prepareMetadata(entity, templates, thesauris);
  formattedEntity.metadata = formattedEntity.metadata.reduce(
    (memo, property) => ({ ...memo, [property.name]: property }),
    {}
  );
  return formattedEntity;
};

export default class Entity extends Component {
  static async requestState(requestParams, state) {
    const [[entity], relationTypes, [connectionsGroups, searchResults, sort, filters]] =
      await Promise.all([
        entitiesAPI.get(requestParams.set({ sharedId: requestParams.data.sharedId })),
        relationTypesAPI.get(requestParams.onlyHeaders()),
        relationships.requestState(requestParams, state),
      ]);

    const entityTemplate = state.templates.find(t => t.get('_id') === entity.template);

    let additionalActions = [];

    if (entityTemplate.get('entityViewPage')) {
      const pageQuery = { sharedId: entityTemplate.get('entityViewPage') };
      const { pageView, itemLists, datasets } = await getPageAssets(
        requestParams.set(pageQuery),
        undefined,
        {
          entity: formatEntity(entity, state.templates, state.thesauris),
          entityRaw: entity,
          template: entityTemplate,
        }
      );

      const pageActions = [
        actions.set('page/pageView', pageView),
        actions.set('page/itemLists', itemLists),
        actions.set('page/datasets', datasets),
      ];

      additionalActions = additionalActions.concat(pageActions);
    }

    return [
      actions.set('relationTypes', relationTypes),
      actions.set('entityView/entity', entity),
      relationships.setReduxState({
        relationships: {
          list: {
            sharedId: entity.sharedId,
            entity,
            connectionsGroups,
            searchResults,
            sort,
            filters,
            view: 'graph',
          },
        },
      }),
    ].concat(additionalActions);
  }

  componentWillUnmount() {
    this.context.store.dispatch(uiActions.resetUserSelectedTab());
    this.context.store.dispatch(actions.unset('page/pageView'));
    this.context.store.dispatch(actions.unset('page/itemLists'));
    this.context.store.dispatch(actions.unset('page/datasets'));
  }

  static renderTools() {
    return (
      <div className="searchBox">
        <SearchButton storeKey="library" />
      </div>
    );
  }

  render() {
    return <EntityViewer />;
  }
}

Entity.contextTypes = {
  store: PropTypes.object,
};
