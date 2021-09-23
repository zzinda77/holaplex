import StyleVariables from '@/common/constants/styles';
import { Card, Col, Typography } from 'antd';
import Color from 'color';
import { NextRouter } from 'next/router';
import { assocPath, has, isNil, not, reduce } from 'ramda';
import { RuleObject } from 'rc-field-form/lib/interface';
import { ReactChild } from 'react';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import { ArweaveScope } from '../arweave/client';
import { ArweaveFile } from '../arweave/types';
import type { GoogleTracker } from '../ganalytics/types';
import { stylesheet } from '../theme';

export const { Text, Title, Paragraph } = Typography;

export const PreviewButton = styled.div<{ textColor: string }>`
  height: 52px;
  background: ${(props) => props.color};
  color: ${(props) => props.textColor};
  width: fit-content;
  padding: 0 24px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  font-weight: 700;
`;

export const UploadedLogo = styled.img`
  height: 48px;
  width: 48px;
`;

export const PreviewLink = styled.div`
  color: ${(props) => props.color};
  text-decoration: underline;
`;

type PrevTitleProps = {
  color: string;
  level: number;
  fontFamily: string;
};
export const PrevTitle = styled(Title)`
  &.ant-typography {
    font-family: '${({ fontFamily }: PrevTitleProps) => fontFamily}', sans;
    color: ${({ color }: PrevTitleProps) => color};
  }
`;

type PrevTextProps = {
  color: string;
  fontFamily: string;
};

export const PrevText = styled(Text)`
  &.ant-typography {
    font-family: '${({ fontFamily }: PrevTextProps) => fontFamily}', sans;
    color: ${({ color }: PrevTextProps) => color};
  }
`;
type PrevCardProps = {
  bgColor: string;
};

export const PrevCard = styled(Card)`
  &.ant-card {
    border-radius: 12px;
    height: 100%;
    display: flex;
    align-items: center;
    background-color: ${({ bgColor }: PrevCardProps) => bgColor};
  }
`;

export const PageCard = styled(Card)`
  margin: 70px 0 32px 0;
`;

export const PrevCol = styled(Col)`
  margin: 0 0 24px 0;
`;

export interface FieldData {
  name: string | number | (string | number)[];
  value?: any;
  touched?: boolean;
  validating?: boolean;
  errors?: string[];
}

/// Half reverse-engineered, mostly to avoid use of any
export interface AntdFile {
  uid: string;
  name: string;
  type: string;
  size: number;
  percent?: number;
  status?: 'uploading' | 'done' | 'error' | 'removed';
  response: ArweaveFile;
  xhr?: unknown;
}

export type FileInput = ArweaveFile | AntdFile;

export const popFile = (f: FileInput): ArweaveFile => {
  if (has<'response'>('response', f)) {
    return f.response;
  } else {
    return f;
  }
};

export const reduceFieldData = (data: FieldData[]) =>
  reduce<FieldData, Record<string, any>>(
    (acc, data) => assocPath(data.name instanceof Array ? data.name : [data.name], data.value, acc),
    {},
    data
  );

export interface StorefrontEditorProps {
  track: GoogleTracker;
}

export const validateSubdomainUniqueness = (
  ar: ArweaveScope,
  allowPubkey?: string
): ((rule: RuleObject, subdomain: string | null | undefined) => Promise<void>) => {
  return async (_, subdomain) => {
    const storefront = await ar.storefront.find('holaplex:metadata:subdomain', subdomain ?? '');

    if (isNil(storefront)) return;
    if (allowPubkey && storefront.pubkey === allowPubkey) return;

    throw new Error('The subdomain is already in use.  Please pick another.');
  };
};

export const validateArweaveFunds = (
  arweaveWalletAddress: string,
  ar: ArweaveScope,
  setShowARModal: (val: boolean) => void
): ((rule: RuleObject, [file]: [FileInput?]) => Promise<void>) => {
  return async (_, [file]) => {
    if (isNil(file) || has('url', file)) return;

    const canAfford =
      arweaveWalletAddress && (await ar.wallet.canAfford(arweaveWalletAddress, file.size));

    if (canAfford) return;

    setShowARModal(true);

    throw new Error('Not enough AR funds to cover the upload fee.');
  };
};

export const submitCallback = ({
  track,
  router,
  arweaveWalletAddress,
  ar,
  pubkey,
  values,
  setSubmitting,
  setShowARModal,
  successToast,
  errorToast,
  trackEvent,
}: {
  track: GoogleTracker;
  router: NextRouter;
  arweaveWalletAddress: string;
  ar: ArweaveScope;
  pubkey: string;
  values: any;
  setSubmitting: (val: boolean) => void;
  setShowARModal: (val: boolean) => void;
  successToast: (domain: string) => ReactChild;
  errorToast: () => ReactChild;
  trackEvent: string;
}): (() => Promise<void>) => {
  return async () => {
    try {
      setSubmitting(true);

      const { theme, meta, subdomain } = values;
      const domain = `${subdomain}.holaplex.com`;

      const logo = popFile(theme.logo[0]);
      const favicon = popFile(meta.favicon[0]);

      const css = stylesheet({ ...theme, logo });

      if (
        isNil(arweaveWalletAddress) ||
        not(ar.wallet.canAfford(arweaveWalletAddress, Buffer.byteLength(css, 'utf8')))
      ) {
        setSubmitting(false);
        setShowARModal(true);

        return Promise.reject();
      }

      await ar.storefront.upsert(
        {
          pubkey,
          subdomain,
          theme: { ...theme, logo },
          meta: { ...meta, favicon },
        },
        css
      );

      toast(successToast.bind(undefined, domain), { autoClose: 60000 });

      router.push('/').then(() => {
        track('storefront', trackEvent);
        setSubmitting(false);
      });
    } catch {
      setSubmitting(false);
      toast.error(errorToast);
    }
  };
};

export const getTextColor = (color: Parameters<typeof Color>[0]) =>
  new Color(color).isDark() ? StyleVariables.colors.buttonText : StyleVariables.colors.text;