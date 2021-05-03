import db from 'api/utils/testing_db';
import pages from '../pages';

const pageToUpdate = db.id();

export default {
  pages: [
    {
      _id: db.id(),
      sharedId: '1',
      language: 'es',
      title: 'Batman finishes',
      user: { username: 'user' },
      entityView: true,
    },
    {
      _id: db.id(),
      sharedId: '1',
      language: 'en',
      title: 'Batman finishes',
      user: { username: 'user' },
    },
    {
      _id: pageToUpdate,
      sharedId: '2',
      language: 'es',
      title: 'Penguin almost done',
      creationDate: 1,
      user: { username: 'user' },
    },
    {
      _id: db.id(),
      sharedId: '2',
      language: 'fr',
      title: 'Right there',
      user: { username: 'user' },
    },
  ],

  settings: [
    { _id: db.id(), languages: [{ key: 'es', default: true }, { key: 'pt' }, { key: 'en' }] },
  ],
  templates: [
    {
      _id: db.id(),
      title: 'Template with custom page 1',
      entityViewPage: '1',
    },
    {
      _id: db.id(),
      title: 'Template with custom page 2',
      entityViewPage: '1',
    },
  ],
};

export { pageToUpdate };