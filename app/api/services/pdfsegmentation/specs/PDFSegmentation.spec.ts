/* eslint-disable camelcase */
/* eslint-disable max-lines */

import { fixturer, createNewMongoDB } from 'api/utils/testing_db';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  fixturesOneFile,
  fixturesOtherFile,
  fixturesPdfNameA,
  fixturesPdfNameB,
  fixturesTwelveFiles,
  fixturesFiveFiles,
  fixturesMissingPdf,
} from 'api/services/pdfsegmentation/specs/fixtures';

import { fs, fileExists } from 'api/files';
import path from 'path';

import { tenants } from 'api/tenants/tenantContext';
import { DB } from 'api/odm';
import { Db } from 'mongodb';
import request from 'shared/JSONRequest';

import { PDFSegmentation } from '../PDFSegmentation';
import { SegmentationModel } from '../segmentationModel';
import { ExternalDummyService } from '../../tasksmanager/specs/ExternalDummyService';

jest.mock('api/services/tasksmanager/TaskManager.ts');

describe('PDFSegmentation', () => {
  let segmentPdfs: PDFSegmentation;

  const folders = {
    uploadedDocuments: `${__dirname}/uploads`,
    attachments: `${__dirname}/uploads`,
    customUploads: `${__dirname}/uploads`,
    temporalFiles: `${__dirname}/uploads`,
    activityLogs: `${__dirname}/uploads`,
  };

  const tenantOne = {
    name: 'tenantOne',
    dbName: 'tenantOne',
    indexName: 'tenantOne',
    ...folders,
  };

  const tenantTwo = {
    name: 'tenantTwo',
    dbName: 'tenantTwo',
    indexName: 'tenantTwo',
    ...folders,
  };

  let dbOne: Db;
  let dbTwo: Db;
  let fileA: Buffer;
  let fileB: Buffer;
  let mongod: MongoMemoryServer;

  afterAll(async () => {
    await DB.disconnect();
    await mongod.stop();
  });

  beforeAll(async () => {
    mongod = await createNewMongoDB();
    const mongoUri = mongod.getUri();
    await DB.connect(mongoUri);
  });

  beforeEach(async () => {
    segmentPdfs = new PDFSegmentation();
    dbOne = DB.connectionForDB(tenantOne.dbName).db;
    dbTwo = DB.connectionForDB(tenantTwo.dbName).db;

    tenants.tenants = { tenantOne };
    fileA = await fs.readFile(`app/api/services/pdfsegmentation/specs/uploads/${fixturesPdfNameA}`);
    fileB = await fs.readFile(`app/api/services/pdfsegmentation/specs/uploads/${fixturesPdfNameA}`);
    jest.spyOn(request, 'uploadFile').mockResolvedValue({});
    jest.resetAllMocks();
  });

  it('should send the pdf', async () => {
    await fixturer.clearAllAndLoad(dbOne, fixturesOneFile);

    await segmentPdfs.segmentPdfs();
    expect(request.uploadFile).toHaveBeenCalledWith(
      'http://localhost:1234/files/tenantOne',
      fixturesPdfNameA,
      fileA
    );
  });

  it('should send other pdf to segment', async () => {
    await fixturer.clearAllAndLoad(dbOne, fixturesOtherFile);
    await segmentPdfs.segmentPdfs();
    expect(request.uploadFile).toHaveBeenCalledWith(
      'http://localhost:1234/files/tenantOne',
      fixturesPdfNameB,
      fileB
    );
  });

  it('should send 10 pdfs to segment', async () => {
    await fixturer.clearAllAndLoad(dbOne, fixturesTwelveFiles);
    await segmentPdfs.segmentPdfs();
    expect(request.uploadFile).toHaveBeenCalledTimes(10);
  });

  it('should send pdfs from different tenants with the information extraction on', async () => {
    await fixturer.clearAllAndLoad(dbOne, fixturesOneFile);
    await fixturer.clearAllAndLoad(dbTwo, fixturesOtherFile);
    tenants.tenants = { tenantOne, tenantTwo };

    await segmentPdfs.segmentPdfs();

    expect(request.uploadFile).toHaveBeenCalledTimes(2);
  });

  it('should start the tasks', async () => {
    await fixturer.clearAllAndLoad(dbOne, fixturesOneFile);

    await segmentPdfs.segmentPdfs();

    expect(segmentPdfs.segmentationTaskManager?.startTask).toHaveBeenCalledWith({
      params: { filename: 'documentA.pdf' },
      tenant: 'tenantOne',
      task: 'segmentation',
    });
  });

  it('should store the segmentation process state', async () => {
    await fixturer.clearAllAndLoad(dbOne, fixturesOneFile);

    await segmentPdfs.segmentPdfs();
    await tenants.run(async () => {
      const [segmentation] = await SegmentationModel.get();
      expect(segmentation.status).toBe('processing');
      expect(segmentation.filename).toBe(fixturesPdfNameA);
      expect(segmentation.fileID).toEqual(fixturesOneFile.files![0]._id);
    }, 'tenantOne');
  });

  it('should only send pdfs not already segmented or in the process', async () => {
    await fixturer.clearAllAndLoad(dbOne, fixturesFiveFiles);
    await dbOne.collection('segmentations').insertMany([
      {
        filename: fixturesFiveFiles.files![0].filename,
        fileID: fixturesFiveFiles.files![0]._id,
        status: 'processing',
      },
    ]);

    await segmentPdfs.segmentPdfs();

    expect(segmentPdfs.segmentationTaskManager?.startTask).toHaveBeenCalledTimes(4);
  });

  describe('if the file is missing', () => {
    it('should throw an error and store the segmentation as failed', async () => {
      await fixturer.clearAllAndLoad(dbOne, fixturesMissingPdf);

      await segmentPdfs.segmentPdfs();

      await tenants.run(async () => {
        const segmentations = await SegmentationModel.get();
        const [segmentation] = segmentations;
        expect(segmentation.status).toBe('failed');
        expect(segmentation.filename).toBe(fixturesMissingPdf.files![0].filename);
        expect(segmentations.length).toBe(1);
      }, 'tenantOne');
    });
  });

  describe('when there is pending tasks', () => {
    it('should not put more', async () => {
      await fixturer.clearAllAndLoad(dbOne, fixturesFiveFiles);

      segmentPdfs.segmentationTaskManager!.countPendingTasks = async () => Promise.resolve(10);

      await segmentPdfs.segmentPdfs();

      expect(segmentPdfs.segmentationTaskManager?.startTask).not.toHaveBeenCalled();
    });
  });

  describe('when there is NOT segmentation config', () => {
    it('should do nothing', async () => {
      await fixturer.clearAllAndLoad(dbOne, { ...fixturesOneFile, settings: [{}] });
      await segmentPdfs.segmentPdfs();

      expect(segmentPdfs.segmentationTaskManager?.startTask).not.toHaveBeenCalled();
    });
  });

  describe('when the segmentation finsihes', () => {
    let segmentationExternalService: ExternalDummyService;
    let segmentationData: {
      page_width: number;
      page_height: number;
      paragraphs: object[];
    };
    let segmentationFolder: string;
    beforeEach(async () => {
      await fixturer.clearAllAndLoad(dbOne, fixturesOneFile);
      await segmentPdfs.segmentPdfs();
      segmentationFolder = path.join(tenantOne.uploadedDocuments, 'segmentation');
      if (await fileExists(segmentationFolder)) {
        await fs.rmdir(segmentationFolder, { recursive: true });
      }
      segmentationExternalService = new ExternalDummyService(1235);
      await segmentationExternalService.start();

      segmentationData = {
        page_width: 600,
        page_height: 1200,
        paragraphs: [
          {
            left: 30,
            top: 45,
            width: 400,
            height: 120,
            page_number: 1,
            text: 'El veloz murciélago hindú comía feliz cardillo y kiwi.',
          },
        ],
      };
      segmentationExternalService.setResults(segmentationData);
      segmentationExternalService.setFileResults(path.join(__dirname, '/uploads/test.xml'));
    });

    afterEach(async () => {
      await segmentationExternalService.stop();

      if (await fileExists(segmentationFolder)) {
        await fs.rmdir(segmentationFolder, { recursive: true });
      }
    });
    it('should store the segmentation', async () => {
      await segmentPdfs.processResults({
        tenant: tenantOne.name,
        params: { filename: 'documentA.pdf' },
        data_url: 'http://localhost:1235/results',
        file_url: 'http://localhost:1235/file',
        task: 'segmentation',
        success: true,
      });

      await tenants.run(async () => {
        const segmentations = await SegmentationModel.get();
        const [segmentation] = segmentations;
        expect(segmentation.status).toBe('ready');
        expect(segmentation.filename).toBe(fixturesPdfNameA);
        expect(segmentation.fileID).toEqual(fixturesOneFile.files![0]._id);
        expect(segmentation.autoexpire).toBe(null);

        expect(segmentation.segmentation).toEqual(
          expect.objectContaining({
            ...segmentationData,
            paragraphs: [expect.objectContaining(segmentationData.paragraphs[0])],
          })
        );
      }, tenantOne.name);
    });

    it('should store the xml file', async () => {
      await segmentPdfs.processResults({
        tenant: tenantOne.name,
        params: { filename: 'documentA.pdf' },
        data_url: 'http://localhost:1235/results',
        file_url: 'http://localhost:1235/file',
        task: 'segmentation',
        success: true,
      });
      const fileContents = await fs.readFile(
        path.join(segmentationFolder, 'documentA.xml'),
        'utf8'
      );
      expect(await fileExists(path.join(segmentationFolder, 'documentA.xml'))).toBe(true);
      const xml = '<description>Cold shrimps soup</description>';
      expect(fileContents.includes(xml)).toBe(true);
    });

    describe('if the segmentation fails', () => {
      it('should store it as failed', async () => {
        await segmentPdfs.processResults({
          tenant: tenantOne.name,
          params: { filename: 'documentA.pdf' },
          data_url: 'http://localhost:1235/results',
          file_url: 'http://localhost:1235/file',
          task: 'segmentation',
          success: false,
        });

        await tenants.run(async () => {
          const segmentations = await SegmentationModel.get();
          const [segmentation] = segmentations;
          expect(segmentation.status).toBe('failed');
          expect(segmentation.filename).toBe(fixturesPdfNameA);
          expect(segmentation.fileID).toEqual(fixturesOneFile.files![0]._id);
          expect(segmentation.autoexpire).toBe(null);
          expect(segmentations.length).toBe(1);
        }, tenantOne.name);
      });
    });
  });
});
