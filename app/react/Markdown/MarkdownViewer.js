import PropTypes from 'prop-types';
import React, { Component } from 'react';
import rison from 'rison';

import CustomComponents from './components';
import CustomHookComponents from './CustomHooks';

import markdownToReact from './markdownToReact';

export class MarkdownViewer extends Component {
  static errorHtml(index) {
    return (
      <p key={index} className="error">
        <br />
        <strong><i>Custom component markup error: unsuported values! Please check your configuration</i></strong>
        <br />
      </p>
    );
  }

  static customHook(config, index) {
    let output;
    try {
      const props = rison.decode(config);
      if (!CustomHookComponents[props.component]) {
        throw new Error('Invalid  component');
      }
      const Element = CustomHookComponents[props.component];
      output = <Element {...props} key={index} />;
    } catch (err) {
      output = MarkdownViewer.errorHtml(index);
    }
    return output;
  }

  list(config, index) {
    const listData = this.props.lists[this.renderedLists] || {};
    const output = <CustomComponents.ItemList key={index} link={`/library/${listData.params}`} items={listData.items} options={listData.options}/>;
    this.renderedLists += 1;
    return output;
  }

  render() {
    this.renderedLists = 0;
    const MyElement = markdownToReact(this.props.markdown, (type, config, index) => {
      if (type === 'list') {
        return this.list(config, index);
      }

      if (['vimeo', 'youtube', 'media'].includes(type)) {
        return <CustomComponents.MarkdownMedia key={index} config={config} />;
      }

      if (type === 'customhook') {
        return MarkdownViewer.customHook(config, index);
      }

      return false;
    }, this.props.html);

    if (!MyElement) {
      return false;
    }

    return <div className="markdown-viewer">{MyElement}</div>;
  }
}

MarkdownViewer.defaultProps = {
  lists: [],
  markdown: '',
  html: false
};

MarkdownViewer.propTypes = {
  markdown: PropTypes.string,
  lists: PropTypes.arrayOf(PropTypes.object),
  html: PropTypes.bool
};

export default MarkdownViewer;
