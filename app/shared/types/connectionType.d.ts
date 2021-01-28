/* eslint-disable */
/**AUTO-GENERATED. RUN yarn emit-types to update.*/
import { TextSelection } from 'react-pdf-handler';

import { ObjectIdSchema } from 'shared/types/commonTypes';

import { EntitySchema } from 'shared/types/entityType';

export interface ConnectionSchema {
  _id?: ObjectIdSchema;
  hub?: ObjectIdSchema;
  template?: ObjectIdSchema;
  file?: ObjectIdSchema;
  entity?: unknown;
  entityData?: {
    _id?: ObjectIdSchema;
    sharedId?: string;
    language?: string;
    mongoLanguage?: string;
    title?: string;
    template?: ObjectIdSchema;
    published?: boolean;
    icon?: {
      _id?: string | null;
      label?: string;
      type?: string;
    };
    attachments?: {
      _id?: ObjectIdSchema;
      originalname?: string;
      filename?: string;
      mimetype?: string;
      timestamp?: number;
      size?: number;
      [k: string]: unknown | undefined;
    }[];
    creationDate?: number;
    user?: ObjectIdSchema;
    metadata?: {
      [k: string]:
        | {
            value:
              | null
              | string
              | number
              | {
                  label?: string | null;
                  url?: string | null;
                }
              | {
                  from?: number | null;
                  to?: number | null;
                }
              | {
                  label?: string;
                  lat: number;
                  lon: number;
                }
              | {
                  label?: string;
                  lat: number;
                  lon: number;
                }[];
            label?: string;
            suggestion_confidence?: number;
            suggestion_model?: string;
            provenance?: '' | 'BULK_ACCEPT';
            [k: string]: unknown | undefined;
          }[]
        | undefined;
    };
    suggestedMetadata?: {
      [k: string]:
        | {
            value:
              | null
              | string
              | number
              | {
                  label?: string | null;
                  url?: string | null;
                }
              | {
                  from?: number | null;
                  to?: number | null;
                }
              | {
                  label?: string;
                  lat: number;
                  lon: number;
                }
              | {
                  label?: string;
                  lat: number;
                  lon: number;
                }[];
            label?: string;
            suggestion_confidence?: number;
            suggestion_model?: string;
            provenance?: '' | 'BULK_ACCEPT';
            [k: string]: unknown | undefined;
          }[]
        | undefined;
    };
    [k: string]: unknown | undefined;
  };
  reference?: TextSelection;
}
