import Foundation

class DustAPIClient {
  static let shared = DustAPIClient()

  private var baseURL: String {
    return AppConfig.dustBaseURL
  }
  private let session = URLSession.shared

  private init() {}

  // MARK: - Authentication

  private func createAuthenticatedRequest(
    for url: URL,
    apiKey: String,
    workspaceId: String? = nil
  ) -> URLRequest {
    var request = URLRequest(url: url)
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }

  // MARK: - API Calls

  func fetchSpaces(apiKey: String, workspaceId: String) async throws
    -> [DustSpace]
  {
    let urlString = "\(baseURL)/w/\(workspaceId)/spaces"
    guard let url = URL(string: urlString) else {
      throw DustAPIError(message: "Invalid URL: \(urlString)", statusCode: nil)
    }

    let request = createAuthenticatedRequest(
      for: url,
      apiKey: apiKey,
      workspaceId: workspaceId
    )

    do {
      let (data, response) = try await session.data(for: request)

      guard let httpResponse = response as? HTTPURLResponse else {
        throw DustAPIError.networkError
      }

      guard httpResponse.statusCode == 200 else {
        if httpResponse.statusCode == 401 {
          throw DustAPIError.invalidCredentials
        }
        throw DustAPIError(
          message: "HTTP \(httpResponse.statusCode)",
          statusCode: httpResponse.statusCode
        )
      }

      let spacesResponse = try JSONDecoder().decode(
        DustSpacesResponse.self,
        from: data
      )
      return spacesResponse.spaces

    } catch let error as DustAPIError {
      throw error
    } catch {
      if error is DecodingError {
        throw DustAPIError.decodingError
      }
      throw DustAPIError.networkError
    }
  }

  func fetchDataSourceViews(
    apiKey: String,
    workspaceId: String,
    spaceId: String
  ) async throws -> [DustDataSourceView] {
    let urlString =
      "\(baseURL)/w/\(workspaceId)/spaces/\(spaceId)/data_source_views"
    guard let url = URL(string: urlString) else {
      throw DustAPIError(message: "Invalid URL: \(urlString)", statusCode: nil)
    }

    let request = createAuthenticatedRequest(
      for: url,
      apiKey: apiKey,
      workspaceId: workspaceId
    )

    do {
      let (data, response) = try await session.data(for: request)

      guard let httpResponse = response as? HTTPURLResponse else {
        throw DustAPIError.networkError
      }

      guard httpResponse.statusCode == 200 else {
        if httpResponse.statusCode == 401 {
          throw DustAPIError.invalidCredentials
        }
        throw DustAPIError(
          message: "HTTP \(httpResponse.statusCode)",
          statusCode: httpResponse.statusCode
        )
      }

      let dataSourceViewsResponse = try JSONDecoder().decode(
        DustDataSourceViewsResponse.self,
        from: data
      )
      // Filter to only return manual data sources (where connectorProvider is null)
      return dataSourceViewsResponse.dataSourceViews.filter {
        $0.isManualDataSource
      }

    } catch let error as DustAPIError {
      throw error
    } catch {
      if error is DecodingError {
        throw DustAPIError.decodingError
      }
      throw DustAPIError.networkError
    }
  }

  // MARK: - Transcript Upload

  func uploadTranscript(
    apiKey: String,
    workspaceId: String,
    spaceId: String,
    dataSourceId: String,
    documentId: String,
    audioFileURL: URL
  ) async throws -> DustTranscriptUploadResponse {
    let urlString =
      "\(baseURL)/w/\(workspaceId)/spaces/\(spaceId)/data_sources/\(dataSourceId)/documents/\(documentId)/transcript"
    guard let url = URL(string: urlString) else {
      throw DustAPIError(message: "Invalid URL: \(urlString)", statusCode: nil)
    }

    // Check file exists and get file data
    guard FileManager.default.fileExists(atPath: audioFileURL.path) else {
      throw DustAPIError(message: "Audio file not found", statusCode: nil)
    }

    let audioData: Data
    do {
      audioData = try Data(contentsOf: audioFileURL)
    } catch {
      throw DustAPIError(message: "Failed to read audio file", statusCode: nil)
    }

    // Check file size (25MB limit)
    let maxSize = 25 * 1024 * 1024
    guard audioData.count <= maxSize else {
      throw DustAPIError(message: "File too large (max 25MB)", statusCode: nil)
    }

    // Create multipart form data
    let boundary = UUID().uuidString
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
    request.setValue(
      "multipart/form-data; boundary=\(boundary)",
      forHTTPHeaderField: "Content-Type"
    )

    var body = Data()

    // Add audio file
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append(
      "Content-Disposition: form-data; name=\"audio\"; filename=\"\(audioFileURL.lastPathComponent)\"\r\n"
        .data(using: .utf8)!
    )
    body.append("Content-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
    body.append(audioData)
    body.append("\r\n".data(using: .utf8)!)

    // Close boundary
    body.append("--\(boundary)--\r\n".data(using: .utf8)!)

    request.httpBody = body

    do {
      let (data, response) = try await session.data(for: request)

      guard let httpResponse = response as? HTTPURLResponse else {
        throw DustAPIError.networkError
      }

      guard httpResponse.statusCode == 200 else {
        if httpResponse.statusCode == 401 {
          throw DustAPIError.invalidCredentials
        }
        if httpResponse.statusCode == 429 {
          throw DustAPIError(message: "Rate limit exceeded", statusCode: 429)
        }
        throw DustAPIError(
          message: "Upload failed",
          statusCode: httpResponse.statusCode
        )
      }

      let uploadResponse = try JSONDecoder().decode(
        DustTranscriptUploadResponse.self,
        from: data
      )
      return uploadResponse

    } catch let error as DustAPIError {
      throw error
    } catch {
      if error is DecodingError {
        throw DustAPIError.decodingError
      }
      throw DustAPIError.networkError
    }
  }

  // MARK: - Combined Operations

  func fetchAvailableFolders(apiKey: String, workspaceId: String) async throws
    -> [DustFolder]
  {
    // First, fetch all spaces
    let spaces = try await fetchSpaces(apiKey: apiKey, workspaceId: workspaceId)

    var folders: [DustFolder] = []

    // For each space, fetch its data source views
    for space in spaces {
      do {
        let dataSourceViews = try await fetchDataSourceViews(
          apiKey: apiKey,
          workspaceId: workspaceId,
          spaceId: space.sId
        )

        // Convert data source views to folders
        let spaceFolders = dataSourceViews.map { dataSourceView in
          DustFolder(
            id: "\(space.sId)/\(dataSourceView.sId)",
            name: dataSourceView.name,
            spaceName: space.name,
            spaceId: space.sId,
            dataSourceId: dataSourceView.dataSource.sId
          )
        }

        folders.append(contentsOf: spaceFolders)
      } catch {
        // Log error but continue with other spaces
        print(
          "Failed to fetch data source views for space \(space.name): \(error)"
        )
      }
    }

    return folders.sorted { $0.displayName < $1.displayName }
  }
}
