/*eslint max-nested-callbacks: ["error", 10], max-len: ["error", 300]*/
import { catchErrors } from 'api/utils/jasmineHelpers';
import selectors from '../helpers/selectors.js';
import createNightmare from '../helpers/nightmare';

const nightmare = createNightmare();

describe('Entity zone', () => {
  describe('metadata editing', () => {
    it('should log in as admin and go into the entity viewer for the desired entity', (done) => {
      const entityTitle = 'Man-bat';

      nightmare
      .login('admin', 'admin')
      .openEntityFromLibrary(entityTitle)
      .getInnerText(selectors.entityView.contentHeader)
      .then((headerText) => {
        expect(headerText).toContain(entityTitle);
        done();
      })
      .catch(catchErrors(done));
    }, 10000);

    it('should allow changing the entity\'s title and template (common properties)', (done) => {
      nightmare
      .editEntityFromEntityViewer()
      .write(selectors.entityView.metadataFormTitle, ' (Dr. Langstrom)')
      .select(selectors.entityView.metadataFormType, '58ad7d240d44252fee4e61fb')
      .saveEntityFromEntityViewer()
      .getInnerText(selectors.entityView.contentHeader)
      .then((headerText) => {
        expect(headerText).toContain('Man-bat (Dr. Langstrom)');
        expect(headerText).toContain('Super Villian');
      })
      .then(() => nightmare
      .editEntityFromEntityViewer()
      .clearInput(selectors.entityView.metadataFormTitle)
      .write(selectors.entityView.metadataFormTitle, 'Man-bat')
      .saveEntityFromEntityViewer())
      .then(done)
      .catch(catchErrors(done));
    });

    it('should allow changing the different template\'s properties', (done) => {
      selectors.manBatEntity = {
        form: {
          realName: '#metadataForm > div:nth-child(4) > div:nth-child(1) > ul > li.wide > div > input',
          age: '#metadataForm > div:nth-child(4) > div:nth-child(2) > ul > li.wide > input',
          knownAccomplices: {
            joker: '#metadataForm > div:nth-child(4) > div:nth-child(3) > ul > li.wide > ul > li:nth-child(3) > label'
          },
          mainSuperpower: '#metadataForm > div:nth-child(4) > div:nth-child(4) > ul > li.wide > select',
          suporPowers: {
            fly: '#metadataForm > div:nth-child(4) > div:nth-child(5) > ul > li.wide > ul > li:nth-child(3) > label',
            laserBeam: '#metadataForm > div:nth-child(4) > div:nth-child(5) > ul > li.wide > ul > li:nth-child(5) > label'
          },
          firstSighting: '#metadataForm > div:nth-child(4) > div:nth-child(6) > ul > li.wide > div > input',
          whoIsHe: '#metadataForm > div:nth-child(4) > div:nth-child(7) > ul > li.wide > div > div.tab-content.tab-content-visible > textarea'
        },
        viewer: {
          realName: '#app > div.content > div > div > main > div > div.tab-content.tab-content-visible > div > div > div.view > dl:nth-child(1) > dd',
          age: '#app > div.content > div > div > main > div > div.tab-content.tab-content-visible > div > div > div.view > dl:nth-child(2) > dd',
          knownAccomplices: '#app > div.content > div > div > main > div > div.tab-content.tab-content-visible > div > div > div.view > dl > dd > ul > li > a',
          mainSuperpower: '#app > div.content > div > div > main > div > div.tab-content.tab-content-visible > div > div > div.view > dl:nth-child(4) > dd',
          superpowers: '#app > div.content > div > div > main > div > div.tab-content.tab-content-visible > div > div > div.view > dl:nth-child(5) > dd > ul',
          firstSight: '#app > div.content > div > div > main > div > div.tab-content.tab-content-visible > div > div > div.view > dl:nth-child(6) > dd',
          whoIsHe: '#app > div.content > div > div > main > div > div.tab-content.tab-content-visible > div > div > div.view > dl:nth-child(7) > dd > div > div > p'
        }
      };

      nightmare
      .editEntityFromEntityViewer()
      .select(selectors.entityView.metadataFormType, '58f0aed2e147e720856a0741')
      .wait(selectors.manBatEntity.form.realName)
      .write(selectors.manBatEntity.form.realName, 'Dr. Kirk Langstrom')
      .write(selectors.manBatEntity.form.age, '39')
      .waitToClick(selectors.manBatEntity.form.knownAccomplices.joker)
      .select(selectors.manBatEntity.form.mainSuperpower, 'b3eac310-8e9e-4adf-bd4c-13ed9f5765cb')
      .waitToClick(selectors.manBatEntity.form.suporPowers.fly)
      .wait(selectors.manBatEntity.form.suporPowers.laserBeam)
      .waitToClick(selectors.manBatEntity.form.suporPowers.laserBeam)
      .pickToday(selectors.manBatEntity.form.firstSighting)
      .write(selectors.manBatEntity.form.whoIsHe, 'This is your typical Jekyll and Hyde story: To cure his progressing ' +
                                                 'deafness, Dr. Langstrom invented a serum to give him echolocation ' +
                                                 '(a sonar that bats use to guide them in the dark). Yay science! ' +
                                                 'Downside: the serum’s side-effects transformed sweet Dr. Langstrom ' +
                                                 'into a hideous 7-foot mindless bat creature known as Man-Bat. To add ' +
                                                 'to the minus column: the mutating serum is highly addictive, guaranteeing ' +
                                                 'that Man-Bat will rear his ugly head over and over.')
      .saveEntityFromEntityViewer()
      .refresh()
      .getInnerText(selectors.manBatEntity.viewer.realName)
      .then((text) => {
        expect(text).toBe('Dr. Kirk Langstrom');
        return nightmare.getInnerText(selectors.manBatEntity.viewer.age);
      })
      .then((text) => {
        expect(text).toBe('39');
        return nightmare.getInnerText(selectors.manBatEntity.viewer.knownAccomplices);
      })
      .then((text) => {
        expect(text).toBe('Joker');
        return nightmare.getInnerText(selectors.manBatEntity.viewer.mainSuperpower);
      })
      .then((text) => {
        expect(text).toBe('fly');
        return nightmare.getInnerText(selectors.manBatEntity.viewer.superpowers);
      })
      .then((text) => {
        expect(text).toBe('fly\nlaser beam\n');
        return nightmare.getInnerText(selectors.manBatEntity.viewer.whoIsHe);
      })
      .then((text) => {
        expect(text.match('Jekyll and Hyde story')).not.toBe(null);
      })
      .then(done)
      .catch(catchErrors(done));
    }, 20000);
  });

  describe('closing browser', () => {
    it('should close the browser', (done) => {
      nightmare.end()
      .then(done);
    });
  });
});
