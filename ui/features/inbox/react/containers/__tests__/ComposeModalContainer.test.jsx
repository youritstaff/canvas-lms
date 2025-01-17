/*
 * Copyright (C) 2020 - present Instructure, Inc.
 *
 * This file is part of Canvas.
 *
 * Canvas is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, version 3 of the License.
 *
 * Canvas is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 * A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import {AlertManagerContext} from '@canvas/alerts/react/AlertManager'
import {ApolloProvider} from '@apollo/client'
import ComposeModalManager from '../ComposeModalContainer/ComposeModalManager'
import {fireEvent, render, waitFor} from '@testing-library/react'
import waitForApolloLoading from '../../../util/waitForApolloLoading'
import {handlers, inboxSettingsHandlers} from '../../../graphql/mswHandlers'
import {mswClient} from '../../../../../shared/msw/mswClient'
import {mswServer} from '../../../../../shared/msw/mswServer'
import React from 'react'
import {ConversationContext} from '../../../util/constants'
import * as utils from '../../../util/utils'
import * as uploadFileModule from '@canvas/upload-file'
import {graphql} from 'msw'

jest.mock('@canvas/upload-file')

jest.mock('../../../util/utils', () => ({
  responsiveQuerySizes: jest.fn().mockReturnValue({
    desktop: {minWidth: '768px'},
  }),
}))

describe('ComposeModalContainer', () => {
  const server = mswServer(handlers.concat(inboxSettingsHandlers()))

  beforeAll(() => {
    // Ensure server is clean before starting
    server.close()
    server.listen({onUnhandledRequest: 'error'})

    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: true,
      media: '',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }))
  })

  beforeEach(() => {
    uploadFileModule.uploadFiles = jest.fn().mockResolvedValue([])
    window.ENV = {
      current_user_id: '1',
      CONVERSATIONS: {
        ATTACHMENTS_FOLDER_ID: 1,
        CAN_MESSAGE_ACCOUNT_CONTEXT: false,
      },
    }
  })

  afterEach(async () => {
    server.resetHandlers()
    // Clear any pending timers
    jest.clearAllTimers()
    // Wait for any pending Apollo operations
    await waitForApolloLoading()
  })

  afterAll(() => {
    server.close()
  })

  const setup = ({
    setOnFailure = jest.fn(),
    setOnSuccess = jest.fn(),
    isReply,
    isReplyAll,
    isForward,
    conversation,
    selectedIds = ['1'],
    isSubmissionCommentsType = false,
    inboxSignatureBlock = false,
  } = {}) =>
    render(
      <ApolloProvider client={mswClient}>
        <AlertManagerContext.Provider value={{setOnFailure, setOnSuccess}}>
          <ConversationContext.Provider value={{isSubmissionCommentsType}}>
            <ComposeModalManager
              open={true}
              onDismiss={jest.fn()}
              isReply={isReply}
              isReplyAll={isReplyAll}
              isForward={isForward}
              conversation={conversation}
              onSelectedIdsChange={jest.fn()}
              selectedIds={selectedIds}
              inboxSignatureBlock={inboxSignatureBlock}
            />
          </ConversationContext.Provider>
        </AlertManagerContext.Provider>
      </ApolloProvider>,
    )

  const uploadFiles = (element, files) => {
    fireEvent.change(element, {
      target: {
        files,
      },
    })
  }

  describe('rendering', () => {
    it('should render', async () => {
      const component = setup()
      await waitForApolloLoading()
      expect(component.container).toBeTruthy()
    })
  })

  describe('Include Observers Button', () => {
    beforeEach(() => {
      window.ENV.CONVERSATIONS.CAN_MESSAGE_ACCOUNT_CONTEXT = true
    })

    it('should not render if context is not selected', async () => {
      const component = setup()
      await waitForApolloLoading()
      expect(component.container).toBeTruthy()
      expect(component.queryByTestId('include-observer-button')).toBeFalsy()
    })

    it('should render if context is selected', async () => {
      const component = setup()

      const select = await component.findByTestId('course-select-modal')
      fireEvent.click(select)
      const selectOptions = await component.findAllByText('Fighting Magneto 101')
      fireEvent.click(selectOptions[0])

      expect(await component.findByTestId('include-observer-button')).toBeTruthy()
    })
  })

  it('validates course', async () => {
    const component = setup()

    // Wait for modal and Apollo queries to complete
    await waitForApolloLoading()
    const messageBody = await component.findByTestId('message-body')
    expect(messageBody).toBeInTheDocument()

    // Hit send
    const button = component.getByTestId('send-button')
    fireEvent.click(button)

    // More specific error expectation
    const errorMessage = await component.findByText('Please select a course')
    expect(errorMessage).toBeInTheDocument()
  })

  describe('Inbox Settings Loader', () => {
    beforeEach(() => {
      // Mock Apollo query response
      mswServer.use(
        graphql.query('GetMyInboxSettings', (req, res, ctx) => {
          return res(
            ctx.data({
              myInboxSettings: {
                _id: '1',
                useSignature: true,
                signature: 'Test Signature',
                useOutOfOffice: false,
                outOfOfficeFirstDate: null,
                outOfOfficeLastDate: null,
                outOfOfficeSubject: null,
                outOfOfficeMessage: null,
                __typename: 'InboxSettings',
              },
            }),
          )
        }),
      )
    })
  })

  describe('Attachments', () => {
    beforeEach(() => {
      // Reset upload mock before each test
      uploadFileModule.uploadFiles.mockReset()
    })

    it('attempts to upload a file', async () => {
      const mockUploadResult = [{id: '1', name: 'file1.jpg'}]
      uploadFileModule.uploadFiles.mockResolvedValue(mockUploadResult)

      const {findByTestId} = setup()
      await waitForApolloLoading()

      const fileInput = await findByTestId('attachment-input')
      expect(fileInput).toBeInTheDocument()

      const file = new File(['foo'], 'file.pdf', {type: 'application/pdf'})
      uploadFiles(fileInput, [file])

      await waitFor(() => {
        expect(uploadFileModule.uploadFiles).toHaveBeenCalledWith([file], '/files/pending', {
          conversations: true,
        })
      })
    })

    it('allows uploading multiple files', async () => {
      const mockUploadResult = [
        {id: '1', name: 'file1.jpg'},
        {id: '2', name: 'file2.jpg'},
      ]
      uploadFileModule.uploadFiles.mockResolvedValue(mockUploadResult)

      const {findByTestId} = setup()
      await waitForApolloLoading()

      const fileInput = await findByTestId('attachment-input')
      expect(fileInput).toBeInTheDocument()

      const file1 = new File(['foo'], 'file1.pdf', {type: 'application/pdf'})
      const file2 = new File(['foo'], 'file2.pdf', {type: 'application/pdf'})

      uploadFiles(fileInput, [file1, file2])

      await waitFor(() => {
        expect(uploadFileModule.uploadFiles).toHaveBeenCalledWith(
          [file1, file2],
          '/files/pending',
          {conversations: true},
        )
      })
    })
  })

  describe('Media', () => {
    it('opens the media upload modal', async () => {
      const container = setup()
      await waitForApolloLoading()
      const mediaButton = await container.findByTestId('media-upload')
      fireEvent.click(mediaButton)
      expect(await container.findByText('Upload Media')).toBeInTheDocument()
    })
  })

  describe('Subject', () => {
    it('allows setting the subject', async () => {
      const {findByTestId} = setup()
      await waitForApolloLoading()
      const subjectInput = await findByTestId('subject-input')
      fireEvent.click(subjectInput)
      fireEvent.change(subjectInput, {target: {value: 'Potato'}})
      expect(subjectInput.value).toEqual('Potato')
    })
  })

  describe('Body', () => {
    it('allows setting the body', async () => {
      const {findByTestId} = setup()
      await waitForApolloLoading()
      const bodyInput = await findByTestId('message-body')
      fireEvent.change(bodyInput, {target: {value: 'Potato'}})
      expect(bodyInput.value).toEqual('Potato')
    })
  })

  describe('Course Select', () => {
    it('queries graphql for courses', async () => {
      const component = setup()

      const select = await component.findByTestId('course-select-modal')
      fireEvent.click(select)

      const selectOptions = await component.findAllByText('Fighting Magneto 101')
      expect(selectOptions.length).toBeGreaterThan(0)
    })

    it('removes enrollment duplicates that come from graphql', async () => {
      const component = setup()

      const select = await component.findByTestId('course-select-modal')
      fireEvent.click(select) // This will fail without the fix because of an unhandled error. We can't have items with duplicate keys because of our jest-setup.

      const selectOptions = await component.findAllByText('Flying The Blackbird')
      expect(selectOptions).toHaveLength(1)
    })

    it('does not render All Courses option', async () => {
      const {findByTestId, queryByText} = setup()
      await waitForApolloLoading()
      const courseDropdown = await findByTestId('course-select-modal')
      fireEvent.click(courseDropdown)
      expect(await queryByText('All Courses')).not.toBeInTheDocument()
    })

    it('does not render concluded groups', async () => {
      const {findByTestId, queryByText} = setup()
      await waitForApolloLoading()
      const courseDropdown = await findByTestId('course-select-modal')
      fireEvent.click(courseDropdown)
      expect(await queryByText('concluded_group')).not.toBeInTheDocument()
    })

    it('does not render concluded courses', async () => {
      const {findByTestId, queryByText} = setup()
      await waitForApolloLoading()
      const courseDropdown = await findByTestId('course-select-modal')
      fireEvent.click(courseDropdown)
      expect(await queryByText('Fighting Magneto 202')).not.toBeInTheDocument()
    })
  })

  describe('Create Conversation', () => {
    it('does not close modal when an error occurs', async () => {
      const mockedSetOnSuccess = jest.fn().mockResolvedValue({})
      const mockedSetOnFailure = jest.fn().mockResolvedValue({})

      const component = setup({
        setOnFailure: mockedSetOnFailure,
        setOnSuccess: mockedSetOnSuccess,
        selectedIds: [],
      })

      // Wait for modal to load
      await waitForApolloLoading()
      const messageBody = await component.findByTestId('message-body')
      expect(messageBody).toBeInTheDocument()

      // Hit send
      const button = component.getByTestId('send-button')
      fireEvent.click(button)

      expect(mockedSetOnSuccess).not.toHaveBeenCalled()
      expect(mockedSetOnFailure).toHaveBeenCalled()
      expect(await component.findByTestId('compose-modal-desktop')).toBeInTheDocument()
    })
  })

  describe('reply', () => {
    const mockConversation = {
      _id: '1',
      messages: [
        {
          author: {
            _id: '1337',
          },
        },
      ],
    }

    it('does not allow changing the context', async () => {
      const component = setup({isReply: true})
      await waitForApolloLoading()
      expect(component.queryByTestId('course-select-modal')).toBeNull()
    })

    it('does not allow changing the subject', async () => {
      const component = setup({isReply: true})
      await waitForApolloLoading()
      expect(component.queryByTestId('subject-input')).toBeNull()
    })

    it('should include past messages', async () => {
      const component = setup({isReply: true, conversation: mockConversation})
      await waitForApolloLoading()
      expect(await component.findByTestId('past-messages')).toBeInTheDocument()
    })

    it('displays specific error message for reply errors', async () => {
      const mockedSetOnSuccess = jest.fn().mockResolvedValue({})

      const mockConversationWithError = {
        _id: '3',
        messages: [
          {
            author: {
              _id: '1337',
            },
          },
        ],
      }

      const component = setup({
        setOnSuccess: mockedSetOnSuccess,
        isReply: true,
        conversation: mockConversationWithError,
      })

      // Wait for modal to load
      await waitForApolloLoading()
      const messageBody = await component.findByTestId('message-body')
      expect(messageBody).toBeInTheDocument()

      // Set body
      const bodyInput = await component.findByTestId('message-body')
      fireEvent.change(bodyInput, {target: {value: 'Potato'}})

      // Hit send
      const button = component.getByTestId('send-button')
      fireEvent.click(button)
      await waitFor(() =>
        expect(
          component.queryByText(
            'The following recipients have no active enrollment in the course, ["Student 2"], unable to send messages',
          ),
        ).toBeInTheDocument(),
      )
    })

    describe('Submission Comments', () => {
      const mockSubmission = {
        _id: '1',
        subject: 'submission1 - course',
        messages: [
          {
            author: {
              _id: '1337',
            },
          },
        ],
      }
      it('should replace compose message with submission subject', async () => {
        const component = setup({
          isReply: true,
          conversation: mockSubmission,
          isSubmissionCommentsType: true,
        })
        await waitForApolloLoading()
        expect(component.queryByText(mockSubmission.subject)).toBeInTheDocument()
        expect(component.queryByText('Compose Message')).not.toBeInTheDocument()
      })

      it('should only have body, cancel, and send inputs', async () => {
        const component = setup({
          isReply: true,
          conversation: mockSubmission,
          isSubmissionCommentsType: true,
        })
        await waitForApolloLoading()

        expect(component.queryByTestId('compose-modal-desktop')).toBeInTheDocument()
        expect(component.queryByTestId('cancel-button')).toBeInTheDocument()
        expect(component.queryByTestId('send-button')).toBeInTheDocument()
        expect(component.queryByTestId('compose-modal-inputs')).not.toBeInTheDocument()
        expect(component.queryByTestId('attachment-upload')).not.toBeInTheDocument()
        expect(component.queryByTestId('attachment-input')).not.toBeInTheDocument()
        expect(component.queryByTestId('media-upload')).not.toBeInTheDocument()
      })

      it('does not display success message when submission reply has errors', async () => {
        const SUBMISSION_ID_THAT_RETURNS_ERROR = '440'
        const mockErrorSubmission = {
          _id: SUBMISSION_ID_THAT_RETURNS_ERROR,
          subject: 'submission1 - course',
          messages: [
            {
              author: {
                _id: '1337',
              },
            },
          ],
        }
        const mockedSetOnSuccess = jest.fn().mockResolvedValue({})

        const component = setup({
          setOnSuccess: mockedSetOnSuccess,
          isReply: true,
          conversation: mockErrorSubmission,
          isSubmissionCommentsType: true,
        })

        // Wait for modal to load
        await waitForApolloLoading()
        const messageBody = await component.findByTestId('message-body')
        expect(messageBody).toBeInTheDocument()

        // Set body
        const bodyInput = await component.findByTestId('message-body')
        fireEvent.change(bodyInput, {target: {value: 'Potato'}})

        // Hit send
        const button = component.getByTestId('send-button')
        fireEvent.click(button)

        await waitFor(() => expect(mockedSetOnSuccess).not.toHaveBeenCalled())
      })
    })
  })

  describe('Responsive', () => {
    describe('Mobile', () => {
      beforeEach(() => {
        utils.responsiveQuerySizes.mockReturnValue({
          mobile: {maxWidth: '67'},
        })
      })

      it('Should emit correct testId for mobile compose window', async () => {
        const component = setup()
        await waitForApolloLoading()
        const modal = await component.findByTestId('compose-modal-mobile')
        expect(modal).toBeTruthy()
      })
    })

    describe('Desktop', () => {
      beforeEach(() => {
        utils.responsiveQuerySizes.mockReturnValue({
          desktop: {minWidth: '768'},
        })
      })

      it('Should emit correct testId for destop compose window', async () => {
        const component = setup()
        await waitForApolloLoading()
        const modal = await component.findByTestId('compose-modal-desktop')
        expect(modal).toBeTruthy()
      })
    })
  })

  it('validates recipients', async () => {
    const mockedSetOnFailure = jest.fn().mockResolvedValue({})
    const mockConversation = {
      _id: '1',
      messages: [
        {
          author: {
            _id: '1337',
          },
          recipients: [
            {
              _id: '1337',
            },
            {
              _id: '1338',
            },
          ],
        },
      ],
    }
    const component = setup({
      conversation: mockConversation,
      isForward: true,
      setOnFailure: mockedSetOnFailure,
      selectedIds: [],
    })

    // Wait for modal to load
    await waitForApolloLoading()
    const messageBody = await component.findByTestId('message-body')
    expect(messageBody).toBeInTheDocument()

    // Hit send
    const button = component.getByTestId('send-button')
    fireEvent.click(button)
    expect(mockedSetOnFailure).toHaveBeenCalledWith(
      'Please insert a message body., Please select a recipient.',
      true,
    )

    expect(component.findByText('Please select a recipient.')).toBeTruthy()

    // Write something...
    fireEvent.change(component.getByTestId('compose-modal-header-address-book-input'), {
      target: {value: 'potato'},
    })

    // Hit send
    fireEvent.click(button)

    expect(component.findByText('No matches found. Please insert a valid recipient.')).toBeTruthy()
  })
})
