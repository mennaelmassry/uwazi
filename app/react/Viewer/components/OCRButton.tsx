import React from 'react';
import { Translate } from 'app/I18N';
import { FeatureToggle } from 'app/components/Elements/FeatureToggle';
import { FileType } from 'shared/types/fileType';
import { dummyOCRPost, dummyOCRGet } from '../actions/ocrActions';

const processing = (
  <div className="in-queue">
    <p>
      <Translate>Processing OCR</Translate>&nbsp;...
    </p>
  </div>
);

const statusDisplay = (file: FileType, ocrStatus: string) => {
  const addToQueue = (
    <button type="button" className="btn btn-default" onClick={() => dummyOCRPost(file)}>
      <Translate>Add to OCR queue</Translate>
    </button>
  );

  switch (ocrStatus) {
    case 'noOCR':
      return addToQueue;

    case 'inQueue':
      return (
        <div className="in-queue">
          <p>
            <Translate>In OCR queue</Translate>
          </p>
        </div>
      );

    case 'cannotProcess':
      return (
        <div className="cant-process">
          <p>
            <Translate>Cannot be processed</Translate>
          </p>
        </div>
      );

    case 'withOCR':
      return (
        <div className="complete">
          <p>
            <Translate>OCR Complete</Translate>&nbsp;&#10004;
          </p>
        </div>
      );

    default:
      return addToQueue;
  }
};

type OCRButtonProps = {
  file: FileType;
};

const OCRButton = ({ file }: OCRButtonProps) => {
  const ocrStatus = dummyOCRGet(file.filename || '');

  return (
    <FeatureToggle feature="ocrtrigger">
      <div className="ocr-service-display">{statusDisplay(file, ocrStatus)}</div>
    </FeatureToggle>
  );
};

export { OCRButton };