import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import React from 'react';
import Immutable from 'immutable';
import { metadataSelectors } from '../selectors';
import Metadata from '../components/Metadata';

const removeUneededProps = ({ templates, thesauris, settings, excludePreview, ...rest }) => rest;

const BaseFormatMetadata = ({
  additionalMetadata,
  sortedProperty,
  entity,
  relationships,
  attachments,
  ...props
}) => (
  <Metadata
    metadata={additionalMetadata.concat(
      metadataSelectors.formatMetadata(props, entity, sortedProperty, relationships, {
        excludePreview: props.excludePreview,
      })
    )}
    compact={!!sortedProperty}
    attachments={attachments}
    {...removeUneededProps(props)}
  />
);

BaseFormatMetadata.defaultProps = {
  sortedProperty: '',
  additionalMetadata: [],
  relationships: Immutable.fromJS([]),
  excludePreview: false,
};

BaseFormatMetadata.propTypes = {
  entity: PropTypes.shape({
    metadata: PropTypes.object,
  }).isRequired,
  relationships: PropTypes.object,
  additionalMetadata: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string,
      value: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
        PropTypes.arrayOf(PropTypes.string),
        PropTypes.arrayOf(
          PropTypes.shape({
            value: PropTypes.string,
          })
        ),
      ]),
    })
  ),
  sortedProperty: PropTypes.string,
  excludePreview: PropTypes.bool,
  attachments: PropTypes.arrayOf(PropTypes.object),
};

export function mapStateToProps(state, { entity, sortedProperty = '' }) {
  const { selectedDocuments } = state.library.ui.toJS();

  const attachments = selectedDocuments[0] ? selectedDocuments[0].attachments : [];

  return {
    templates: state.templates,
    thesauris: state.thesauris,
    settings: state.settings.collection,
    entity,
    sortedProperty,
    attachments,
  };
}

export const FormatMetadata = connect(mapStateToProps)(BaseFormatMetadata);
